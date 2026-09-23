using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Api.Mapping;
using Heliograph.Contracts;
using Heliograph.Engine;
using Heliograph.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Heliograph.Api.Tests.Api;

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

    private HeliographDbContext Db(Microsoft.Extensions.DependencyInjection.IServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<HeliographDbContext>();

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
                (new Coord(4, 9), TestBoard.Mirror(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Keep(Player.P2)),
                (new Coord(7, 0), TestBoard.Keep(Player.P1))));
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
        Assert.Equal(5, winner.Ratings.Count);
        var winnerBlitz = BucketFor(winner, "Blitz");
        Assert.True(winnerBlitz.Rating > 1200);
        Assert.Equal(1, winnerBlitz.GamesPlayed);
        Assert.Equal(1, winnerBlitz.Wins);
        Assert.Equal(0, winnerBlitz.Losses);
        // The other four buckets are untouched by a Blitz result.
        foreach (var category in new[] { "Bullet", "Rapid", "Daily", "Untimed" })
        {
            var bucket = BucketFor(winner, category);
            Assert.Equal(1200, bucket.Rating);
            Assert.Equal(0, bucket.GamesPlayed);
            Assert.Equal(0, bucket.Wins);
            Assert.Equal(0, bucket.Losses);
        }

        Assert.Equal(p2Auth.User.Id, loser!.Id);
        var loserBlitz = BucketFor(loser, "Blitz");
        Assert.True(loserBlitz.Rating < 1200);
        Assert.Equal(1, loserBlitz.GamesPlayed);
        Assert.Equal(0, loserBlitz.Wins);
        Assert.Equal(1, loserBlitz.Losses);
        foreach (var category in new[] { "Bullet", "Rapid", "Daily", "Untimed" })
        {
            var bucket = BucketFor(loser, category);
            Assert.Equal(1200, bucket.Rating);
            Assert.Equal(0, bucket.GamesPlayed);
            Assert.Equal(0, bucket.Wins);
            Assert.Equal(0, bucket.Losses);
        }

        // Row-level check: the game itself is marked Rated, and the summary reflects it.
        var summary = (await p1.GetFromJsonAsync<List<GameSummary>>("/api/games"))!.Single(g => g.Id == room.GameId);
        Assert.True(summary.Rated);
    }

    [SkippableFact]
    public async Task An_untimed_rated_games_win_updates_only_the_untimed_bucket()
    {
        // Owner decision: a rated untimed game moves the fifth Untimed bucket, exactly like a
        // Blitz/Bullet/Rapid/Daily result moves its own category — never a no-op, and never any
        // of the other four buckets.
        var (p1, p1Auth) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);
        var (p2, p2Auth) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = Db(scope);
            var row = await db.Games.SingleAsync(g => g.Id == room.GameId);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Mirror(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Keep(Player.P2)),
                (new Coord(7, 0), TestBoard.Keep(Player.P1))));
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

        var winnerUntimed = BucketFor(winner, "Untimed");
        Assert.True(winnerUntimed.Rating > 1200);
        Assert.Equal(1, winnerUntimed.GamesPlayed);
        Assert.Equal(1, winnerUntimed.Wins);
        Assert.Equal(0, winnerUntimed.Losses);
        var loserUntimed = BucketFor(loser, "Untimed");
        Assert.True(loserUntimed.Rating < 1200);
        Assert.Equal(1, loserUntimed.GamesPlayed);
        Assert.Equal(0, loserUntimed.Wins);
        Assert.Equal(1, loserUntimed.Losses);

        foreach (var category in new[] { "Bullet", "Blitz", "Rapid", "Daily" })
        {
            Assert.Equal((1200, 0), (BucketFor(winner, category).Rating, BucketFor(winner, category).GamesPlayed));
            Assert.Equal((1200, 0), (BucketFor(loser, category).Rating, BucketFor(loser, category).GamesPlayed));
        }
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
                (new Coord(4, 9), TestBoard.Mirror(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Keep(Player.P2)),
                (new Coord(7, 0), TestBoard.Keep(Player.P1))));
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
    public async Task Leaderboard_without_auth_returns_401()
    {
        var anonymous = NewClient();

        var res = await anonymous.GetAsync("/api/leaderboard?category=Rapid");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    public async Task Leaderboard_requires_a_known_category()
    {
        // Authed: the 400 for a bad category is only reachable past [Authorize].
        var (client, _) = await NewAuthedClientAsync();

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
