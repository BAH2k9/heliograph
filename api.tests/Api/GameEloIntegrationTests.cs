using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Api.Mapping;
using Khet.Contracts;
using Khet.Engine;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the game/account linkage groundwork: threading a user id onto a room seat,
/// deciding <c>Game.Rated</c>, applying Elo on a rated win, seat-claiming, the <c>mine</c> filter,
/// and the leaderboard. Skips when no Postgres is reachable, same convention as the rest of `Api/`.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class GameEloIntegrationTests(IntegrationFixture fixture)
{
    // Only for genuine anonymous/401 checks now — creating/joining a room requires auth.
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private static string UniqueEmail() => $"elo-{Guid.NewGuid():N}@example.com";

    private async Task<(HttpClient Client, AuthResponse Auth)> NewAuthedClientAsync()
    {
        var client = NewClient();
        var auth = await fixture.RegisterAsync(UniqueEmail(), "Player " + Guid.NewGuid().ToString("N")[..6]);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }

    private static async Task<RoomResponse> CreateRoomAsync(HttpClient client, string? timeControl = null)
    {
        var res = timeControl is null
            ? await client.PostAsync("/api/rooms", content: null)
            : await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(TimeControl: timeControl));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    private static RatingBucket BucketFor(UserProfile profile, string category) =>
        profile.Ratings.Single(r => r.Category == category);

    private KhetDbContext Db(Microsoft.Extensions.DependencyInjection.IServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<KhetDbContext>();

    [SkippableFact]
    public async Task Creating_or_joining_a_room_without_auth_returns_401()
    {
        var anonymous = NewClient();

        var createAttempt = await anonymous.PostAsync("/api/rooms", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, createAttempt.StatusCode);

        var (creator, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(creator);
        var joinAttempt = await anonymous.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, joinAttempt.StatusCode);
    }

    [SkippableFact]
    public async Task A_room_with_no_second_player_yet_stays_unrated_with_only_P1_claimed()
    {
        // Rooms are auth-only now (guest play is gone), so P1 is claimed at creation — the only
        // "unclaimed"/unrated state left to observe is before anyone's joined P2.
        var (creator, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(creator);

        var game = await creator.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.False(game!.Rated);
        Assert.True(game.P1Claimed);
        Assert.False(game.P2Claimed);
    }

    [SkippableFact]
    public async Task A_room_created_and_joined_by_two_accounts_is_rated()
    {
        var (creator, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(creator);

        var (joiner, _) = await NewAuthedClientAsync();
        var joinRes = await joiner.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        Assert.Equal(HttpStatusCode.OK, joinRes.StatusCode);

        var game = await creator.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.True(game!.Rated);
        Assert.True(game.P1Claimed);
        Assert.True(game.P2Claimed);
    }

    [SkippableFact]
    public async Task A_rated_games_win_updates_both_players_elo_and_rated_games_played()
    {
        // "5+0" is a Blitz preset (see TimeControls) — the win should move only the Blitz bucket.
        var (p1, p1Auth) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1, "5+0");
        var (p2, p2Auth) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        // Seed the same P1-wins-by-rotation position used elsewhere in this test suite.
        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = Db(scope);
            var row = await db.Games.SingleAsync(g => g.Id == room.GameId);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Pyramid(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Pharaoh(Player.P2)),
                (new Coord(7, 0), TestBoard.Pharaoh(Player.P1))));
            row.CurrentTurn = Player.P1;
            await db.SaveChangesAsync();
        }

        var rotate = new SubmitMoveRequest("rotate", new CoordDto(4, 9), null, "CCW");
        var res = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/moves", rotate);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<SubmitMoveResponse>();
        Assert.Equal("P1Win", body!.Status);

        var winner = await p1.GetFromJsonAsync<UserProfile>("/api/auth/me");
        var loser = await p2.GetFromJsonAsync<UserProfile>("/api/auth/me");

        Assert.Equal(p1Auth.User.Id, winner!.Id);
        Assert.Equal(4, winner.Ratings.Count);
        var winnerBlitz = BucketFor(winner, "Blitz");
        Assert.True(winnerBlitz.Rating > 1200);
        Assert.Equal(1, winnerBlitz.GamesPlayed);
        // The other three buckets are untouched by a Blitz result.
        foreach (var category in new[] { "Bullet", "Rapid", "Daily" })
        {
            var bucket = BucketFor(winner, category);
            Assert.Equal(1200, bucket.Rating);
            Assert.Equal(0, bucket.GamesPlayed);
        }

        Assert.Equal(p2Auth.User.Id, loser!.Id);
        var loserBlitz = BucketFor(loser, "Blitz");
        Assert.True(loserBlitz.Rating < 1200);
        Assert.Equal(1, loserBlitz.GamesPlayed);
        foreach (var category in new[] { "Bullet", "Rapid", "Daily" })
        {
            var bucket = BucketFor(loser, category);
            Assert.Equal(1200, bucket.Rating);
            Assert.Equal(0, bucket.GamesPlayed);
        }

        // Row-level check: the game itself is marked Rated, and the summary reflects it.
        var summary = (await p1.GetFromJsonAsync<List<GameSummary>>("/api/games"))!.Single(g => g.Id == room.GameId);
        Assert.True(summary.Rated);
    }

    [SkippableFact]
    public async Task An_untimed_rated_games_win_updates_no_rating_bucket()
    {
        // Behavior change from the single-global-Rating days: an untimed rated game has no
        // TimeControlCategory to attribute a rating change to, so it's a no-op for rating purposes
        // (matches chess.com, which has no rating for "no time control" either).
        var (p1, p1Auth) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);
        var (p2, p2Auth) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = Db(scope);
            var row = await db.Games.SingleAsync(g => g.Id == room.GameId);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Pyramid(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Pharaoh(Player.P2)),
                (new Coord(7, 0), TestBoard.Pharaoh(Player.P1))));
            row.CurrentTurn = Player.P1;
            await db.SaveChangesAsync();
        }

        var rotate = new SubmitMoveRequest("rotate", new CoordDto(4, 9), null, "CCW");
        var res = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/moves", rotate);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<SubmitMoveResponse>();
        Assert.Equal("P1Win", body!.Status);

        var winner = await p1.GetFromJsonAsync<UserProfile>("/api/auth/me");
        var loser = await p2.GetFromJsonAsync<UserProfile>("/api/auth/me");

        Assert.Equal(p1Auth.User.Id, winner!.Id);
        Assert.Equal(p2Auth.User.Id, loser!.Id);
        foreach (var category in new[] { "Bullet", "Blitz", "Rapid", "Daily" })
        {
            Assert.Equal((1200, 0), (BucketFor(winner, category).Rating, BucketFor(winner, category).GamesPlayed));
            Assert.Equal((1200, 0), (BucketFor(loser, category).Rating, BucketFor(loser, category).GamesPlayed));
        }
    }

    [SkippableFact]
    public async Task Claim_seat_requires_auth_a_room_game_and_rejects_someone_elses_seat()
    {
        // Rooms are auth-only now, so P1 is already claimed by `creator` at creation — claim-seat's
        // only live behavior left is a self-reclaim no-op and rejecting a different account's steal
        // attempt (see GamesController.ClaimSeat's doc comment on this now being mostly dead code).
        var (creator, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(creator);

        var claimBody = new ClaimSeatRequest("P1");

        // No token at all.
        var anonymous = NewClient();
        var anonAttempt = await anonymous.PostAsJsonAsync($"/api/games/{room.GameId}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.Unauthorized, anonAttempt.StatusCode);

        // A non-room game (created via POST /api/games) has no JoinCode.
        var soloRes = await creator.PostAsync("/api/games", content: null);
        var solo = (await soloRes.Content.ReadFromJsonAsync<GameResponse>())!;
        var nonRoomAttempt = await creator.PostAsJsonAsync($"/api/games/{solo.Id}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.BadRequest, nonRoomAttempt.StatusCode);

        // Unknown game id.
        var missingAttempt = await creator.PostAsJsonAsync($"/api/games/{Guid.NewGuid()}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.NotFound, missingAttempt.StatusCode);

        // Unknown seat name.
        var badSeat = await creator.PostAsJsonAsync($"/api/games/{room.GameId}/claim-seat", new ClaimSeatRequest("P3"));
        Assert.Equal(HttpStatusCode.BadRequest, badSeat.StatusCode);

        // Reclaiming your own (already-claimed-at-creation) seat is a no-op success.
        var reclaim = await creator.PostAsJsonAsync($"/api/games/{room.GameId}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.OK, reclaim.StatusCode);
        var claimResponse = await reclaim.Content.ReadFromJsonAsync<ClaimSeatResponse>();
        Assert.Equal(room.GameId, claimResponse!.GameId);
        Assert.Equal("P1", claimResponse.Seat);
        Assert.True(claimResponse.Claimed);

        var afterReclaim = await creator.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.True(afterReclaim!.P1Claimed);
        Assert.False(afterReclaim.Rated); // still unrated — P2 was never filled

        // A different account cannot take an already-claimed seat.
        var (someoneElse, _) = await NewAuthedClientAsync();
        var stolen = await someoneElse.PostAsJsonAsync($"/api/games/{room.GameId}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.Conflict, stolen.StatusCode);

        // The room shows up in the creator's own archive.
        var mine = await creator.GetFromJsonAsync<List<GameSummary>>("/api/games?mine=true");
        Assert.Contains(mine!, g => g.Id == room.GameId);
    }

    [SkippableFact]
    public async Task Mine_filter_requires_auth_and_only_returns_the_callers_games()
    {
        var guest = NewClient();
        var anonymousAttempt = await guest.GetAsync("/api/games?mine=true");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousAttempt.StatusCode);

        var (owner, _) = await NewAuthedClientAsync();
        var ownRoom = await CreateRoomAsync(owner);

        var (someoneElse, _) = await NewAuthedClientAsync();
        var otherRoom = await CreateRoomAsync(someoneElse);

        var mine = await owner.GetFromJsonAsync<List<GameSummary>>("/api/games?mine=true");
        Assert.Contains(mine!, g => g.Id == ownRoom.GameId);
        Assert.DoesNotContain(mine!, g => g.Id == otherRoom.GameId);
    }

    [SkippableFact]
    public async Task Leaderboard_only_lists_accounts_with_a_rated_game_in_that_category_and_respects_top()
    {
        // "10+0" is a Rapid preset — plays into the Rapid leaderboard only.
        var (p1, p1Auth) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1, "10+0");
        var (p2, _) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = Db(scope);
            var row = await db.Games.SingleAsync(g => g.Id == room.GameId);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Pyramid(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Pharaoh(Player.P2)),
                (new Coord(7, 0), TestBoard.Pharaoh(Player.P1))));
            row.CurrentTurn = Player.P1;
            await db.SaveChangesAsync();
        }
        var rotate = new SubmitMoveRequest("rotate", new CoordDto(4, 9), null, "CCW");
        var moveRes = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/moves", rotate);
        Assert.Equal(HttpStatusCode.OK, moveRes.StatusCode);

        var (neverPlayed, neverPlayedAuth) = await NewAuthedClientAsync();
        _ = neverPlayed;

        var board = await p1.GetFromJsonAsync<List<LeaderboardEntry>>("/api/leaderboard?category=Rapid");
        Assert.Contains(board!, e => e.UserId == p1Auth.User.Id && e.RatedGamesPlayed >= 1);
        Assert.DoesNotContain(board!, e => e.UserId == neverPlayedAuth.User.Id);

        // Not in the Blitz leaderboard — the win was a Rapid result.
        var blitzBoard = await p1.GetFromJsonAsync<List<LeaderboardEntry>>("/api/leaderboard?category=Blitz");
        Assert.DoesNotContain(blitzBoard!, e => e.UserId == p1Auth.User.Id);

        var topOne = await p1.GetFromJsonAsync<List<LeaderboardEntry>>("/api/leaderboard?category=Rapid&top=1");
        Assert.True(topOne!.Count <= 1);
    }

    [SkippableFact]
    public async Task Leaderboard_requires_a_known_category()
    {
        var client = NewClient();

        var missing = await client.GetAsync("/api/leaderboard");
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        var missingError = await missing.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("unknown time control category", missingError!.Error);

        var unknown = await client.GetAsync("/api/leaderboard?category=NotAThing");
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        var unknownError = await unknown.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("NotAThing", unknownError!.Error);
    }
}
