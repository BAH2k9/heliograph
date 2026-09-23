using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Contracts;
using Heliograph.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Heliograph.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the <c>/api/invites*</c> surface (plan <c>07-friend-invites-matches.md</c>):
/// send → accept (creates the game, seats both players, sets <c>Game.Rated</c> from the invite,
/// randomizes P1/P2), send → decline, the claim-pattern expiry re-check at accept time, the
/// wrong-caller 403/404 split, and inviting a non-friend. Skips (doesn't fail) when no Postgres is
/// reachable, same convention as the rest of <c>Api/</c>.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class InvitesEndpointIntegrationTests(IntegrationFixture fixture)
{
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private static string UniqueEmail() => $"invite-{Guid.NewGuid():N}@example.com";

    private Task<AuthResponse> RegisterAsync(string? displayName = null) =>
        fixture.RegisterAsync(UniqueEmail(), displayName ?? "Player" + Guid.NewGuid().ToString("N")[..6]);

    private HttpClient AuthedClient(AuthResponse auth)
    {
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    /// <summary>Registers two accounts and makes them accepted friends via the plan-06 surface.</summary>
    private async Task<(AuthResponse Inviter, AuthResponse Invitee, HttpClient InviterClient, HttpClient InviteeClient)> NewFriendsAsync()
    {
        var inviter = await RegisterAsync("Inviter");
        var invitee = await RegisterAsync("Invitee");
        var inviterClient = AuthedClient(inviter);
        var inviteeClient = AuthedClient(invitee);

        var createRes = await inviterClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(invitee.User.Id));
        var requestId = (await createRes.Content.ReadFromJsonAsync<FriendRequestCreateResponse>())!;
        Assert.Equal("pending", requestId.Status);
        var incoming = (await inviteeClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/incoming"))!;
        await inviteeClient.PostAsync($"/api/friends/requests/{incoming[0].RequestId}/accept", content: null);

        return (inviter, invitee, inviterClient, inviteeClient);
    }

    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();

    private static HeliographDbContext Db(AsyncServiceScope scope) => scope.ServiceProvider.GetRequiredService<HeliographDbContext>();

    [SkippableFact]
    public async Task Send_then_accept_creates_a_rated_game_and_seats_both_players_randomly()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (inviter, invitee, inviterClient, inviteeClient) = await NewFriendsAsync();

        var sawInviterP1 = false;
        var sawInviteeP1 = false;

        // Random P1/P2 assignment: run several sends so both outcomes are observed at least once
        // rather than asserting on a single roll of the coin.
        for (var i = 0; i < 20 && !(sawInviterP1 && sawInviteeP1); i++)
        {
            var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
                new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: true));
            Assert.Equal(HttpStatusCode.Created, sendRes.StatusCode);
            var sent = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;

            var acceptRes = await inviteeClient.PostAsync($"/api/invites/{sent.Id}/accept", content: null);
            Assert.Equal(HttpStatusCode.OK, acceptRes.StatusCode);
            var room = (await acceptRes.Content.ReadFromJsonAsync<RoomResponse>())!;

            await using var scope = Scope();
            var game = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
            Assert.True(game.Rated);
            Assert.Equal(2, game.SeatsTaken);

            var invite = await Db(scope).MatchInvites.AsNoTracking().SingleAsync(inv => inv.Id == sent.Id);
            Assert.Equal(MatchInviteStatus.Accepted, invite.Status);
            Assert.Equal(game.Id, invite.GameId);

            if (game.P1UserId == invitee.User.Id)
            {
                sawInviteeP1 = true;
                Assert.Equal(inviter.User.Id, game.P2UserId);
                Assert.Equal("P1", room.Seat); // the caller (invitee) got P1
            }
            else
            {
                sawInviterP1 = true;
                Assert.Equal(inviter.User.Id, game.P1UserId);
                Assert.Equal(invitee.User.Id, game.P2UserId);
                Assert.Equal("P2", room.Seat); // the caller (invitee) got P2
            }
        }

        Assert.True(sawInviterP1, "inviter never landed on P1 across 20 accepts");
        Assert.True(sawInviteeP1, "invitee never landed on P1 across 20 accepts");
    }

    [SkippableFact]
    public async Task Rated_false_on_the_invite_creates_an_unrated_game()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (inviter, invitee, inviterClient, inviteeClient) = await NewFriendsAsync();

        var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: false));
        var sent = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;
        var acceptRes = await inviteeClient.PostAsync($"/api/invites/{sent.Id}/accept", content: null);
        var room = (await acceptRes.Content.ReadFromJsonAsync<RoomResponse>())!;

        await using var scope = Scope();
        var game = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
        Assert.False(game.Rated);
    }

    [SkippableFact]
    public async Task Send_then_decline_sets_declined_and_never_creates_a_game()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (_, invitee, inviterClient, inviteeClient) = await NewFriendsAsync();

        var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: false));
        var sent = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;

        var declineRes = await inviteeClient.PostAsync($"/api/invites/{sent.Id}/decline", content: null);
        Assert.Equal(HttpStatusCode.NoContent, declineRes.StatusCode);

        await using var scope = Scope();
        var invite = await Db(scope).MatchInvites.AsNoTracking().SingleAsync(i => i.Id == sent.Id);
        Assert.Equal(MatchInviteStatus.Declined, invite.Status);
        Assert.Null(invite.GameId);

        // Now unaccept-able.
        var acceptRes = await inviteeClient.PostAsync($"/api/invites/{sent.Id}/accept", content: null);
        Assert.Equal(HttpStatusCode.NotFound, acceptRes.StatusCode);
    }

    [SkippableFact]
    public async Task Accepting_an_expired_invite_returns_410_and_flips_it_to_expired()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (_, invitee, inviterClient, inviteeClient) = await NewFriendsAsync();

        var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: false));
        var sent = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;

        // Force the row stale by backdating against the fixture's own FakeTimeProvider (what
        // InviteService actually reads via TimeProvider) rather than real DateTime.UtcNow — the
        // fixture clock only ever advances and is seeded at fixture init, so a real-wall-clock
        // backdate would be a race against how long the rest of the suite has been running.
        var fixtureNow = fixture.Factory.TimeProvider.GetUtcNow().UtcDateTime;
        await using (var scope = Scope())
        {
            var db = Db(scope);
            var invite = await db.MatchInvites.SingleAsync(i => i.Id == sent.Id);
            invite.ExpiresAtUtc = fixtureNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        // Expired-but-still-Pending is correctly excluded from the pending list even before the
        // lazy expiry check below ever runs (ListPendingAsync's own ExpiresAtUtc filter).
        var pendingBeforeAccept = await inviteeClient.GetFromJsonAsync<List<PendingMatchInvite>>("/api/invites/pending");
        Assert.DoesNotContain(pendingBeforeAccept!, p => p.Id == sent.Id);

        var acceptRes = await inviteeClient.PostAsync($"/api/invites/{sent.Id}/accept", content: null);
        Assert.Equal((HttpStatusCode)410, acceptRes.StatusCode);

        await using var verifyScope = Scope();
        var reloaded = await Db(verifyScope).MatchInvites.AsNoTracking().SingleAsync(i => i.Id == sent.Id);
        Assert.Equal(MatchInviteStatus.Expired, reloaded.Status);
        Assert.Null(reloaded.GameId);
    }

    [SkippableFact]
    public async Task Accepting_initializes_the_clock_for_a_timed_invite_same_as_a_room_join()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (_, invitee, inviterClient, inviteeClient) = await NewFriendsAsync();

        var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, "5+0", Rated: false)); // Blitz, 300s each, no increment
        var sent = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;

        var acceptRes = await inviteeClient.PostAsync($"/api/invites/{sent.Id}/accept", content: null);
        Assert.Equal(HttpStatusCode.OK, acceptRes.StatusCode);
        var room = (await acceptRes.Content.ReadFromJsonAsync<RoomResponse>())!;

        await using var scope = Scope();
        var game = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
        Assert.Equal("5+0", game.TimeControl);
        Assert.Equal(300_000L, game.P1RemainingMs);
        Assert.Equal(300_000L, game.P2RemainingMs);
        Assert.NotNull(game.TurnStartedAtUtc);
        Assert.NotNull(game.TurnDeadlineUtc);
    }

    [SkippableFact]
    public async Task Accept_or_decline_by_someone_other_than_the_invitee_is_forbidden()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (_, invitee, inviterClient, _) = await NewFriendsAsync();
        var stranger = await RegisterAsync("Stranger");
        var strangerClient = AuthedClient(stranger);

        var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: false));
        var sent = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;

        var acceptRes = await strangerClient.PostAsync($"/api/invites/{sent.Id}/accept", content: null);
        Assert.Equal(HttpStatusCode.Forbidden, acceptRes.StatusCode);

        var declineRes = await strangerClient.PostAsync($"/api/invites/{sent.Id}/decline", content: null);
        Assert.Equal(HttpStatusCode.Forbidden, declineRes.StatusCode);
    }

    [SkippableFact]
    public async Task Accepting_an_unknown_invite_id_returns_404()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (_, _, _, inviteeClient) = await NewFriendsAsync();

        var res = await inviteeClient.PostAsync($"/api/invites/{Guid.NewGuid()}/accept", content: null);

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [SkippableFact]
    public async Task Inviting_a_non_friend_returns_400()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var bob = await RegisterAsync("Bob");
        var aliceClient = AuthedClient(alice);

        var res = await aliceClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(bob.User.Id, null, null, null, Rated: false));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [SkippableFact]
    public async Task Inviting_yourself_returns_400()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var aliceClient = AuthedClient(alice);

        var res = await aliceClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(alice.User.Id, null, null, null, Rated: false));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [SkippableFact]
    public async Task An_unknown_ruleset_name_returns_400()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (_, invitee, inviterClient, _) = await NewFriendsAsync();

        var res = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, "NotARuleset", null, null, Rated: false));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [SkippableFact]
    public async Task Pending_lists_only_the_callers_own_still_pending_invites()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (inviter, invitee, inviterClient, inviteeClient) = await NewFriendsAsync();

        var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: true));
        var sent = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;

        var pending = await inviteeClient.GetFromJsonAsync<List<PendingMatchInvite>>("/api/invites/pending");
        Assert.Single(pending!, p => p.Id == sent.Id);
        Assert.Equal(inviter.User.Id, pending!.Single(p => p.Id == sent.Id).InviterId);

        // The inviter's own pending list is empty — they sent it, they're not the invitee.
        var inviterPending = await inviterClient.GetFromJsonAsync<List<PendingMatchInvite>>("/api/invites/pending");
        Assert.Empty(inviterPending!);
    }

    [SkippableFact]
    public async Task Pending_without_a_token_returns_401()
    {
        var client = NewClient();

        var res = await client.GetAsync("/api/invites/pending");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    /// <summary>
    /// The REST fallback for the inviter's own "waiting for them to accept" screen — see
    /// <see cref="SentMatchInvite"/>'s doc comment for why it exists (a missed <c>inviteAccepted</c>
    /// push, e.g. no live hub connection at accept time, is otherwise unrecoverable).
    /// </summary>
    [SkippableFact]
    public async Task Sent_lists_the_callers_own_pending_and_accepted_invites_with_the_inviters_seat()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (inviter, invitee, inviterClient, inviteeClient) = await NewFriendsAsync();

        var pendingSendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: false));
        var stillPending = (await pendingSendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;

        var acceptedSendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: false));
        var toAccept = (await acceptedSendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;
        var acceptRes = await inviteeClient.PostAsync($"/api/invites/{toAccept.Id}/accept", content: null);
        var inviteeRoom = (await acceptRes.Content.ReadFromJsonAsync<RoomResponse>())!;

        var sent = await inviterClient.GetFromJsonAsync<List<SentMatchInvite>>("/api/invites/sent");

        var pendingRow = Assert.Single(sent!, s => s.Id == stillPending.Id);
        Assert.Equal("Pending", pendingRow.Status);
        Assert.Null(pendingRow.Room);

        var acceptedRow = Assert.Single(sent!, s => s.Id == toAccept.Id);
        Assert.Equal("Accepted", acceptedRow.Status);
        Assert.NotNull(acceptedRow.Room);
        Assert.Equal(inviteeRoom.GameId, acceptedRow.Room!.GameId);
        // The invitee's own RoomResponse names their seat; the inviter's row must name the
        // *other* seat, not just echo the invitee's.
        Assert.NotEqual(inviteeRoom.Seat, acceptedRow.Room!.Seat);

        // The invitee's own sent list is empty — they're the invitee on both, never the inviter.
        var inviteeSent = await inviteeClient.GetFromJsonAsync<List<SentMatchInvite>>("/api/invites/sent");
        Assert.Empty(inviteeSent!);
    }

    /// <summary>
    /// Regression test: an <c>Accepted</c> row used to have no time bound at all in
    /// <c>InviteService.ListSentAsync</c>, so it stayed in <c>GET /api/invites/sent</c> forever —
    /// and the frontend's fallback poll (`InvitePlayScreen`) matches "any accepted invite with a
    /// room", so opening the invite screen long after an old match ended would silently re-enter
    /// that stale, already-finished game. Bounding <c>Accepted</c> rows by the same
    /// <see cref="MatchInvite.ExpiresAtUtc"/> the invite was created with closes that off.
    /// </summary>
    [SkippableFact]
    public async Task Sent_excludes_an_accepted_invite_once_its_own_expiry_has_passed()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (inviter, invitee, inviterClient, inviteeClient) = await NewFriendsAsync();

        var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: false));
        var toAccept = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;
        await inviteeClient.PostAsync($"/api/invites/{toAccept.Id}/accept", content: null);

        using (var scope = Scope())
        {
            var invite = await Db(scope).MatchInvites.SingleAsync(i => i.Id == toAccept.Id);
            invite.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1);
            await Db(scope).SaveChangesAsync();
        }

        var sent = await inviterClient.GetFromJsonAsync<List<SentMatchInvite>>("/api/invites/sent");

        Assert.DoesNotContain(sent!, s => s.Id == toAccept.Id);
    }

    /// <summary>
    /// Regression test for the invite-screen bounce-back bug: an <c>Accepted</c> row whose game has
    /// already finished — plausible for Bullet/Blitz, entirely within the invite's own 5-minute
    /// <see cref="MatchInvite.ExpiresAtUtc"/> window — must still come back with a null
    /// <see cref="SentMatchInvite.Room"/>, exactly like a still-<see cref="MatchInviteStatus.Pending"/>
    /// row. Otherwise <c>InvitePlayScreen</c>'s poll re-enters the dead game and navigates the sender
    /// straight back into a match they already left.
    /// </summary>
    [SkippableFact]
    public async Task Sent_hides_the_room_for_an_accepted_invite_whose_game_has_already_finished()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var (inviter, invitee, inviterClient, inviteeClient) = await NewFriendsAsync();

        var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(invitee.User.Id, null, null, null, Rated: false));
        var toAccept = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;
        var acceptRes = await inviteeClient.PostAsync($"/api/invites/{toAccept.Id}/accept", content: null);
        var room = (await acceptRes.Content.ReadFromJsonAsync<RoomResponse>())!;

        using (var scope = Scope())
        {
            var game = await Db(scope).Games.SingleAsync(g => g.Id == room.GameId);
            game.Status = GameStatus.P1Win;
            await Db(scope).SaveChangesAsync();
        }

        var sent = await inviterClient.GetFromJsonAsync<List<SentMatchInvite>>("/api/invites/sent");

        var acceptedRow = Assert.Single(sent!, s => s.Id == toAccept.Id);
        Assert.Equal("Accepted", acceptedRow.Status);
        Assert.Null(acceptedRow.Room);
    }

    [SkippableFact]
    public async Task Sent_without_a_token_returns_401()
    {
        var client = NewClient();

        var res = await client.GetAsync("/api/invites/sent");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
