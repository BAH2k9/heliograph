using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Heliograph.Api.Tests.Api;

/// <summary>
/// DB-backed tests of <c>/api/users/search</c> and the <c>/api/friends*</c> surface: request →
/// accept/decline, the implicit-accept case, duplicate/already-friends 409s, idempotent unfriend,
/// search semantics, and the <c>Discriminator</c> collision retry every account-creation path uses.
/// Skips when no Postgres is reachable, same convention as the other integration test classes.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class FriendsEndpointIntegrationTests(IntegrationFixture fixture)
{
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private static string UniqueEmail() => $"user-{Guid.NewGuid():N}@example.com";

    private Task<AuthResponse> RegisterAsync(string? displayName = null) =>
        fixture.RegisterAsync(UniqueEmail(), displayName ?? "Player");

    private HttpClient AuthedClient(AuthResponse auth)
    {
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    // ---- request -> accept / decline -------------------------------------------------------

    [SkippableFact]
    public async Task Request_then_accept_creates_the_friendship_both_ways()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var bob = await RegisterAsync("Bob");
        var aliceClient = AuthedClient(alice);
        var bobClient = AuthedClient(bob);

        var createRes = await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bob.User.Id));
        Assert.Equal(HttpStatusCode.Created, createRes.StatusCode);
        var created = await createRes.Content.ReadFromJsonAsync<FriendRequestCreateResponse>();
        Assert.Equal("pending", created!.Status);

        var incoming = await bobClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/incoming");
        Assert.Single(incoming!);
        var requestId = incoming![0].RequestId;
        Assert.Equal(alice.User.Id, incoming[0].UserId);

        var outgoing = await aliceClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/outgoing");
        Assert.Single(outgoing!);
        Assert.Equal(bob.User.Id, outgoing![0].UserId);

        var acceptRes = await bobClient.PostAsync($"/api/friends/requests/{requestId}/accept", content: null);
        Assert.Equal(HttpStatusCode.OK, acceptRes.StatusCode);
        var friendSummary = await acceptRes.Content.ReadFromJsonAsync<FriendSummary>();
        Assert.Equal(alice.User.Id, friendSummary!.UserId);

        var aliceFriends = await aliceClient.GetFromJsonAsync<List<FriendSummary>>("/api/friends");
        Assert.Contains(aliceFriends!, f => f.UserId == bob.User.Id);
        var bobFriends = await bobClient.GetFromJsonAsync<List<FriendSummary>>("/api/friends");
        Assert.Contains(bobFriends!, f => f.UserId == alice.User.Id);

        // No longer pending either direction once accepted.
        Assert.Empty((await aliceClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/outgoing"))!);
        Assert.Empty((await bobClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/incoming"))!);
    }

    [SkippableFact]
    public async Task Request_then_decline_deletes_the_request_entirely()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var bob = await RegisterAsync("Bob");
        var aliceClient = AuthedClient(alice);
        var bobClient = AuthedClient(bob);

        var createRes = await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bob.User.Id));
        var created = (await createRes.Content.ReadFromJsonAsync<FriendRequestCreateResponse>())!;
        Assert.Equal("pending", created.Status);

        var incoming = (await bobClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/incoming"))!;
        var requestId = incoming[0].RequestId;

        var declineRes = await bobClient.PostAsync($"/api/friends/requests/{requestId}/decline", content: null);
        Assert.Equal(HttpStatusCode.NoContent, declineRes.StatusCode);

        Assert.Empty((await bobClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/incoming"))!);
        Assert.Empty((await aliceClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/outgoing"))!);
        Assert.Empty((await aliceClient.GetFromJsonAsync<List<FriendSummary>>("/api/friends"))!);

        // Declining twice (or accepting the now-gone request) 404s.
        var again = await bobClient.PostAsync($"/api/friends/requests/{requestId}/decline", content: null);
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
    }

    [SkippableFact]
    public async Task A_simultaneous_reverse_request_is_an_implicit_accept()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var bob = await RegisterAsync("Bob");
        var aliceClient = AuthedClient(alice);
        var bobClient = AuthedClient(bob);

        var aliceToBob = await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bob.User.Id));
        Assert.Equal(HttpStatusCode.Created, aliceToBob.StatusCode);

        // Bob requests Alice back before responding — this completes the friendship immediately
        // instead of creating a second pending row.
        var bobToAlice = await bobClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(alice.User.Id));
        Assert.Equal(HttpStatusCode.OK, bobToAlice.StatusCode);
        var body = await bobToAlice.Content.ReadFromJsonAsync<FriendRequestCreateResponse>();
        Assert.Equal("accepted", body!.Status);

        Assert.Contains((await aliceClient.GetFromJsonAsync<List<FriendSummary>>("/api/friends"))!, f => f.UserId == bob.User.Id);
        Assert.Contains((await bobClient.GetFromJsonAsync<List<FriendSummary>>("/api/friends"))!, f => f.UserId == alice.User.Id);
        Assert.Empty((await aliceClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/outgoing"))!);
        Assert.Empty((await bobClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/outgoing"))!);
    }

    [SkippableFact]
    public async Task A_second_request_in_the_same_direction_returns_409()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var bob = await RegisterAsync("Bob");
        var aliceClient = AuthedClient(alice);

        var first = await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bob.User.Id));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bob.User.Id));
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [SkippableFact]
    public async Task Requesting_an_already_accepted_friend_returns_409()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var bob = await RegisterAsync("Bob");
        var aliceClient = AuthedClient(alice);
        var bobClient = AuthedClient(bob);

        var createRes = await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bob.User.Id));
        var requestId = (await bobClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/incoming"))![0].RequestId;
        await bobClient.PostAsync($"/api/friends/requests/{requestId}/accept", content: null);

        var again = await bobClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(alice.User.Id));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [SkippableFact]
    public async Task Requesting_self_or_an_unknown_user_returns_400()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var aliceClient = AuthedClient(alice);

        var self = await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(alice.User.Id));
        Assert.Equal(HttpStatusCode.BadRequest, self.StatusCode);

        var unknown = await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
    }

    [SkippableFact]
    public async Task Unfriend_is_idempotent_and_removes_both_directions()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var bob = await RegisterAsync("Bob");
        var aliceClient = AuthedClient(alice);
        var bobClient = AuthedClient(bob);

        await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bob.User.Id));
        var requestId = (await bobClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/incoming"))![0].RequestId;
        await bobClient.PostAsync($"/api/friends/requests/{requestId}/accept", content: null);

        var first = await aliceClient.DeleteAsync($"/api/friends/{bob.User.Id}");
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        Assert.Empty((await aliceClient.GetFromJsonAsync<List<FriendSummary>>("/api/friends"))!);
        Assert.Empty((await bobClient.GetFromJsonAsync<List<FriendSummary>>("/api/friends"))!);

        // Already gone — still 204, not 404.
        var second = await aliceClient.DeleteAsync($"/api/friends/{bob.User.Id}");
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);

        // Never-friended id — also 204.
        var neverFriended = await aliceClient.DeleteAsync($"/api/friends/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NoContent, neverFriended.StatusCode);
    }

    // ---- search -----------------------------------------------------------------------------

    [SkippableFact]
    public async Task Search_excludes_self_and_matches_case_insensitively()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var me = await RegisterAsync($"SearchMe-{suffix}");
        var target = await RegisterAsync($"FindThisPerson-{suffix}");
        var meClient = AuthedClient(me);

        var results = await meClient.GetFromJsonAsync<List<UserSearchResult>>(
            $"/api/users/search?q=findthisperson-{suffix}");

        Assert.Contains(results!, r => r.Id == target.User.Id);
        Assert.DoesNotContain(results!, r => r.Id == me.User.Id);
        var hit = results!.Single(r => r.Id == target.User.Id);
        Assert.Equal(target.User.DisplayName, hit.DisplayName);
        Assert.Equal(4, hit.Discriminator.Length);
    }

    [SkippableFact]
    public async Task Search_with_a_blank_query_returns_400()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var me = await RegisterAsync("Alice");
        var meClient = AuthedClient(me);

        var res = await meClient.GetAsync("/api/users/search?q=%20%20");

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [SkippableFact]
    public async Task Search_without_a_token_returns_401()
    {
        var client = NewClient();

        var res = await client.GetAsync("/api/users/search?q=anything");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    public async Task Deleting_an_account_cascades_away_its_friendship_rows()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var alice = await RegisterAsync("Alice");
        var bob = await RegisterAsync("Bob");
        var carol = await RegisterAsync("Carol");
        var aliceClient = AuthedClient(alice);
        var bobClient = AuthedClient(bob);

        // An accepted friendship (Alice-Bob) and a still-pending request (Carol -> Alice) — both
        // reference Alice's row and both must disappear with it, not orphan or block the delete.
        await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bob.User.Id));
        var requestId = (await bobClient.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/incoming"))![0].RequestId;
        await bobClient.PostAsync($"/api/friends/requests/{requestId}/accept", content: null);
        await AuthedClient(carol).PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(alice.User.Id));

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
            Assert.Equal(2, await db.Friendships.CountAsync(f => f.RequesterId == alice.User.Id || f.AddresseeId == alice.User.Id));

            var user = await db.Users.SingleAsync(u => u.Id == alice.User.Id);
            db.Users.Remove(user);
            await db.SaveChangesAsync(); // must not throw — both FKs are ON DELETE CASCADE, not RESTRICT
        }

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
            Assert.Equal(0, await db.Friendships.CountAsync(f => f.RequesterId == alice.User.Id || f.AddresseeId == alice.User.Id));
        }

        // Bob's own accepted-friends list no longer lists the now-deleted Alice.
        Assert.Empty((await bobClient.GetFromJsonAsync<List<FriendSummary>>("/api/friends"))!);
    }

    // ---- discriminator collision retry ------------------------------------------------------

    /// <summary>
    /// Forces a deterministic <c>(DisplayName, Discriminator)</c> collision via
    /// <see cref="DiscriminatorAssigner.CandidateOverrideForTests"/> instead of relying on
    /// <see cref="Random.Shared"/> to collide across many real registrations — this asserts the
    /// retry loop in <c>AuthService.RegisterAsync</c> actually re-rolls and succeeds, not merely
    /// that duplicates never happen to occur. Runs inside <see cref="IntegrationCollection"/>, whose
    /// tests execute sequentially (one collection = one xUnit test-class group), so the process-wide
    /// static override is safe to set here without another test observing it; the <c>finally</c>
    /// clears it regardless of outcome.
    /// </summary>
    [SkippableFact]
    public async Task A_discriminator_collision_is_retried_until_a_free_value_is_found()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var displayName = $"Clash-{Guid.NewGuid():N}"[..20];

        var first = await RegisterAsync(displayName);

        string takenDiscriminator;
        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
            takenDiscriminator = (await db.Users.AsNoTracking().SingleAsync(u => u.Id == first.User.Id)).Discriminator;
        }

        // First candidate collides with `first`'s own discriminator (forcing exactly one retry
        // through the unique-index violation); the second candidate is guaranteed free since it
        // differs from the only occupied value for this DisplayName.
        var freeDiscriminator = takenDiscriminator == "0000" ? "0001" : "0000";
        var candidates = new Queue<string>([takenDiscriminator, freeDiscriminator]);
        DiscriminatorAssigner.CandidateOverrideForTests = () => candidates.Dequeue();
        try
        {
            var second = await RegisterAsync(displayName);

            await using var scope = fixture.Factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
            var secondRow = await db.Users.AsNoTracking().SingleAsync(u => u.Id == second.User.Id);
            Assert.Equal(freeDiscriminator, secondRow.Discriminator);
        }
        finally
        {
            DiscriminatorAssigner.CandidateOverrideForTests = null;
        }
    }
}
