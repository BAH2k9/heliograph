using Khet.Api.Data;
using Khet.Contracts;
using Khet.Engine.Enums;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the <c>/api/admin</c> surface: the policy gate (401/403), user administration
/// (list/search/create/delete/reset-password/disable/rating/revoke-sessions), game/room cleanup, and
/// force-end (including that it broadcasts <c>gameEnded</c> and leaves Elo alone). Skips (doesn't
/// fail) when no Postgres is reachable, same convention as the rest of <c>Api/</c>.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class AdminEndpointIntegrationTests(IntegrationFixture fixture)
{
    private const string Pw = "correct-horse-1";

    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();
    private static KhetDbContext Db(AsyncServiceScope scope) => scope.ServiceProvider.GetRequiredService<KhetDbContext>();
    private static string UniqueEmail(string tag = "admin") => $"{tag}-{Guid.NewGuid():N}@example.com";

    private HubConnection NewHubConnection()
    {
        var server = fixture.Factory.Server;
        // The hub is auth-only now (guest play is gone) — a plain watcher just needs *a* valid
        // token, not any particular identity, so this registers its own throwaway account.
        var auth = fixture.RegisterAsync().GetAwaiter().GetResult();
        return new HubConnectionBuilder()
            .WithUrl(new Uri(server.BaseAddress, "api/hub"), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();
                options.AccessTokenProvider = () => Task.FromResult<string?>(auth.AccessToken);
            })
            .Build();
    }

    /// <summary>Registers an account (directly via the fixture — no public register endpoint), flips
    /// it to admin in the DB, then re-logs-in so the token carries the <c>is_admin</c> claim.</summary>
    private async Task<(HttpClient Client, AuthResponse Auth)> NewAdminClientAsync()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var email = UniqueEmail();
        var registered = await fixture.RegisterAsync(email, "Admin " + Guid.NewGuid().ToString("N")[..6], Pw);

        await using (var scope = Scope())
            await Db(scope).Users.Where(u => u.Id == registered.User.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.IsAdmin, true));

        var bootstrap = NewClient();
        var login = await bootstrap.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, Pw));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.True(auth.User.IsAdmin);

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }

    private async Task<(HttpClient Client, AuthResponse Auth, string Email)> NewUserClientAsync(string tag = "user")
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var email = UniqueEmail(tag);
        var auth = await fixture.RegisterAsync(email, "User " + Guid.NewGuid().ToString("N")[..6], Pw);
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth, email);
    }

    private async Task<Guid> NewRatedRoomAsync()
    {
        var (p1, _, _) = await NewUserClientAsync("p1");
        var create = await p1.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(TimeControl: "5+0"));
        create.EnsureSuccessStatusCode();
        var room = (await create.Content.ReadFromJsonAsync<RoomResponse>())!;
        var (p2, _, _) = await NewUserClientAsync("p2");
        var join = await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        join.EnsureSuccessStatusCode();
        return room.GameId;
    }

    // ---- policy gate --------------------------------------------------------------------------

    [SkippableTheory]
    [InlineData("GET", "users", HttpStatusCode.OK)]
    [InlineData("GET", "games", HttpStatusCode.OK)]
    [InlineData("GET", "stats", HttpStatusCode.OK)]
    [InlineData("GET", "bug-reports", HttpStatusCode.OK)]
    // Fixed, never-created id — proves the auth gate without needing a pre-existing report; the
    // admin caller (past the gate) gets 404 rather than 200.
    [InlineData("GET", "bug-reports/11111111-1111-1111-1111-111111111111", HttpStatusCode.NotFound)]
    [InlineData("DELETE", "bug-reports/11111111-1111-1111-1111-111111111111", HttpStatusCode.NotFound)]
    public async Task Admin_routes_reject_anonymous_and_non_admin_callers(string method, string path, HttpStatusCode expectedAdminStatus)
    {
        var url = $"/api/admin/{path}";

        var anon = NewClient();
        var anonRes = await anon.SendAsync(new HttpRequestMessage(new HttpMethod(method), url));
        Assert.Equal(HttpStatusCode.Unauthorized, anonRes.StatusCode);

        var (user, _, _) = await NewUserClientAsync();
        var userRes = await user.SendAsync(new HttpRequestMessage(new HttpMethod(method), url));
        Assert.Equal(HttpStatusCode.Forbidden, userRes.StatusCode);

        var (admin, _) = await NewAdminClientAsync();
        var adminRes = await admin.SendAsync(new HttpRequestMessage(new HttpMethod(method), url));
        Assert.Equal(expectedAdminStatus, adminRes.StatusCode);
    }

    // ---- users -------------------------------------------------------------------------------

    [SkippableFact]
    public async Task Lists_and_searches_users()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (_, target, targetEmail) = await NewUserClientAsync("needle");

        var all = await admin.GetFromJsonAsync<AdminUserListResponse>("/api/admin/users?page=1&pageSize=5");
        Assert.NotNull(all);
        Assert.Equal(1, all!.Page);
        Assert.Equal(5, all.PageSize);
        Assert.True(all.Total >= 2);
        Assert.True(all.Users.Count <= 5);

        var search = await admin.GetFromJsonAsync<AdminUserListResponse>($"/api/admin/users?search={targetEmail}");
        Assert.Single(search!.Users);
        Assert.Equal(target.User.Id, search.Users[0].Id);
        Assert.Equal(5, search.Users[0].Ratings.Count);
        Assert.False(search.Users[0].IsAdmin);
        Assert.False(search.Users[0].IsDisabled);
    }

    [SkippableFact]
    public async Task Creates_a_user_who_can_then_log_in_and_rejects_dupes_and_weak_passwords()
    {
        var (admin, _) = await NewAdminClientAsync();
        var email = UniqueEmail("created");

        var create = await admin.PostAsJsonAsync("/api/admin/users",
            new AdminCreateUserRequest(email, Pw, "Fresh Account", IsAdmin: false));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var row = (await create.Content.ReadFromJsonAsync<AdminUserRow>())!;
        Assert.Equal(email, row.Email);
        Assert.False(row.IsAdmin);
        Assert.Equal(0, row.ActiveSessionCount);

        var login = await NewClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, Pw));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var dupe = await admin.PostAsJsonAsync("/api/admin/users",
            new AdminCreateUserRequest(email, Pw, "Someone Else", IsAdmin: false));
        Assert.Equal(HttpStatusCode.Conflict, dupe.StatusCode);

        var weak = await admin.PostAsJsonAsync("/api/admin/users",
            new AdminCreateUserRequest(UniqueEmail(), "short1", "Weak Pw", IsAdmin: false));
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
    }

    [SkippableFact]
    public async Task Reset_password_swaps_credentials_and_revokes_live_sessions()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (_, target, email) = await NewUserClientAsync("pwreset");
        var oldRefresh = target.RefreshToken;

        var reset = await admin.PostAsJsonAsync($"/api/admin/users/{target.User.Id}/password",
            new AdminSetPasswordRequest("brand-new-pw-9"));
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);

        var oldLogin = await NewClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, Pw));
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);

        var newLogin = await NewClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "brand-new-pw-9"));
        Assert.Equal(HttpStatusCode.OK, newLogin.StatusCode);

        var staleRefresh = await NewClient().PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(oldRefresh));
        Assert.Equal(HttpStatusCode.Unauthorized, staleRefresh.StatusCode);

        var missing = await admin.PostAsJsonAsync($"/api/admin/users/{Guid.NewGuid()}/password",
            new AdminSetPasswordRequest("brand-new-pw-9"));
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [SkippableFact]
    public async Task Disabling_a_user_blocks_login_and_refresh_until_re_enabled()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (_, target, email) = await NewUserClientAsync("disable");
        var refresh = target.RefreshToken;

        var disable = await admin.PatchAsJsonAsync($"/api/admin/users/{target.User.Id}",
            new AdminPatchUserRequest(IsDisabled: true));
        Assert.Equal(HttpStatusCode.OK, disable.StatusCode);
        Assert.True((await disable.Content.ReadFromJsonAsync<AdminUserRow>())!.IsDisabled);

        var login = await NewClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, Pw));
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);

        var refreshRes = await NewClient().PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(refresh));
        Assert.Equal(HttpStatusCode.Unauthorized, refreshRes.StatusCode);

        var reEnable = await admin.PatchAsJsonAsync($"/api/admin/users/{target.User.Id}",
            new AdminPatchUserRequest(IsDisabled: false));
        Assert.Equal(HttpStatusCode.OK, reEnable.StatusCode);

        var loginAgain = await NewClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, Pw));
        Assert.Equal(HttpStatusCode.OK, loginAgain.StatusCode);
    }

    [SkippableFact]
    public async Task An_admin_cannot_lock_itself_out()
    {
        var (admin, auth) = await NewAdminClientAsync();

        var demoteSelf = await admin.PatchAsJsonAsync($"/api/admin/users/{auth.User.Id}", new AdminPatchUserRequest(IsAdmin: false));
        Assert.Equal(HttpStatusCode.BadRequest, demoteSelf.StatusCode);

        var disableSelf = await admin.PatchAsJsonAsync($"/api/admin/users/{auth.User.Id}", new AdminPatchUserRequest(IsDisabled: true));
        Assert.Equal(HttpStatusCode.BadRequest, disableSelf.StatusCode);

        var deleteSelf = await admin.DeleteAsync($"/api/admin/users/{auth.User.Id}");
        Assert.Equal(HttpStatusCode.BadRequest, deleteSelf.StatusCode);
    }

    [SkippableFact]
    public async Task Deleting_a_user_keeps_their_games_but_nulls_the_seat_and_drops_their_tokens()
    {
        var (admin, _) = await NewAdminClientAsync();
        var gameId = await NewRatedRoomAsync();

        Guid p1Id;
        await using (var scope = Scope())
        {
            var game = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == gameId);
            p1Id = game.P1UserId!.Value;
        }

        var del = await admin.DeleteAsync($"/api/admin/users/{p1Id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        await using (var scope = Scope())
        {
            var db = Db(scope);
            var game = await db.Games.AsNoTracking().SingleAsync(g => g.Id == gameId);
            Assert.Null(game.P1UserId);
            Assert.NotNull(game.P2UserId);
            Assert.False(await db.Users.AnyAsync(u => u.Id == p1Id));
            Assert.False(await db.RefreshTokens.AnyAsync(t => t.UserId == p1Id));
        }

        var missing = await admin.DeleteAsync($"/api/admin/users/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [SkippableFact]
    public async Task Set_rating_overwrites_one_bucket_and_rejects_an_unknown_category()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (_, target, _) = await NewUserClientAsync("rating");

        var set = await admin.PostAsJsonAsync($"/api/admin/users/{target.User.Id}/rating",
            new AdminSetRatingRequest("Blitz", 1500, GamesPlayed: 10));
        Assert.Equal(HttpStatusCode.OK, set.StatusCode);
        var row = (await set.Content.ReadFromJsonAsync<AdminUserRow>())!;
        var blitz = row.Ratings.Single(r => r.Category == "Blitz");
        Assert.Equal(1500, blitz.Rating);
        Assert.Equal(10, blitz.GamesPlayed);
        Assert.All(row.Ratings.Where(r => r.Category != "Blitz"), r =>
        {
            Assert.Equal(1200, r.Rating);
            Assert.Equal(0, r.GamesPlayed);
        });

        var bad = await admin.PostAsJsonAsync($"/api/admin/users/{target.User.Id}/rating",
            new AdminSetRatingRequest("NotACategory", 1500));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    [SkippableFact]
    public async Task Revoke_sessions_kills_every_live_refresh_token()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (_, target, email) = await NewUserClientAsync("sessions");
        var secondLogin = await NewClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, Pw));
        var secondRefresh = (await secondLogin.Content.ReadFromJsonAsync<AuthResponse>())!.RefreshToken;

        var revoke = await admin.PostAsync($"/api/admin/users/{target.User.Id}/revoke-sessions", content: null);
        Assert.Equal(HttpStatusCode.OK, revoke.StatusCode);
        Assert.True((await revoke.Content.ReadFromJsonAsync<AdminRevokeSessionsResponse>())!.Revoked >= 2);

        foreach (var token in new[] { target.RefreshToken, secondRefresh })
        {
            var res = await NewClient().PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(token));
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        }

        var missing = await admin.PostAsync($"/api/admin/users/{Guid.NewGuid()}/revoke-sessions", content: null);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    // ---- games / rooms ---------------------------------------------------------------------

    [SkippableFact]
    public async Task Deleting_a_game_cascades_its_moves()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (client, _, _) = await NewUserClientAsync();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;
        var move = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves",
            new SubmitMoveRequest("move", new CoordDto(4, 1), new CoordDto(3, 1), null));
        Assert.Equal(HttpStatusCode.OK, move.StatusCode);

        var del = await admin.DeleteAsync($"/api/admin/games/{game.Id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        await using (var scope = Scope())
        {
            var db = Db(scope);
            Assert.False(await db.Games.AnyAsync(g => g.Id == game.Id));
            Assert.False(await db.Moves.AnyAsync(m => m.GameId == game.Id));
        }

        var missing = await admin.DeleteAsync($"/api/admin/games/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [SkippableFact]
    public async Task Force_end_marks_aborted_broadcasts_gameEnded_and_leaves_elo_untouched()
    {
        var (admin, _) = await NewAdminClientAsync();
        var gameId = await NewRatedRoomAsync();

        Guid p1Id, p2Id;
        await using (var scope = Scope())
        {
            var game = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == gameId);
            // Pin the two conditions that WOULD move Elo on an organic ending, so the
            // "buckets unchanged" assertion below tests FinishByAdmin's skip, not an incidental no-op.
            Assert.True(game.Rated);
            Assert.Equal("5+0", game.TimeControl); // a Blitz preset — an organic win here shifts the Blitz bucket
            (p1Id, p2Id) = (game.P1UserId!.Value, game.P2UserId!.Value);
        }

        await using var watcher = NewHubConnection();
        await watcher.StartAsync();
        await watcher.InvokeAsync("Join", gameId.ToString(), (string?)null);
        var ended = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.On<JsonElement>("gameEnded", msg => ended.TrySetResult(msg));

        var force = await admin.PostAsJsonAsync($"/api/admin/games/{gameId}/force-end", new AdminForceEndRequest("P1"));
        Assert.Equal(HttpStatusCode.OK, force.StatusCode);
        var body = (await force.Content.ReadFromJsonAsync<GameEndedResponse>())!;
        Assert.Equal("P1Win", body.Status);
        Assert.Equal("Aborted", body.EndReason);

        var completed = await Task.WhenAny(ended.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == ended.Task, "watcher did not receive the gameEnded broadcast within 5s");
        var payload = await ended.Task;
        Assert.Equal("P1Win", payload.GetProperty("status").GetString());
        Assert.Equal("Aborted", payload.GetProperty("endReason").GetString());

        await using (var scope = Scope())
        {
            var db = Db(scope);
            var game = await db.Games.AsNoTracking().SingleAsync(g => g.Id == gameId);
            Assert.Equal(GameStatus.P1Win, game.Status);
            Assert.Equal("Aborted", game.EndReason);
            Assert.NotNull(game.FinishedAtUtc);

            foreach (var id in new[] { p1Id, p2Id })
            {
                var user = await db.Users.AsNoTracking().SingleAsync(u => u.Id == id);
                Assert.Equal((1200, 0), (user.BlitzRating, user.BlitzGamesPlayed));
                Assert.Equal((1200, 0), (user.BulletRating, user.BulletGamesPlayed));
            }
        }

        var again = await admin.PostAsJsonAsync($"/api/admin/games/{gameId}/force-end", new AdminForceEndRequest("P2"));
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode); // already finished

        var badWinner = await admin.PostAsJsonAsync($"/api/admin/games/{await NewRatedRoomAsync()}/force-end",
            new AdminForceEndRequest("P3"));
        Assert.Equal(HttpStatusCode.BadRequest, badWinner.StatusCode);

        var missing = await admin.PostAsJsonAsync($"/api/admin/games/{Guid.NewGuid()}/force-end", new AdminForceEndRequest("P1"));
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [SkippableFact]
    public async Task Rooms_cleanup_removes_only_old_unfilled_rooms()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (player, _, _) = await NewUserClientAsync();

        async Task<Guid> NewRoomAsync()
        {
            var res = await player.PostAsync("/api/rooms", content: null);
            res.EnsureSuccessStatusCode();
            return (await res.Content.ReadFromJsonAsync<RoomResponse>())!.GameId;
        }

        var staleUnfilled = await NewRoomAsync();

        var staleFilled = await NewRoomAsync();
        await using (var scope = Scope())
        {
            var code = (await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == staleFilled)).JoinCode!;
            (await player.PostAsync($"/api/rooms/{code}/join", content: null)).EnsureSuccessStatusCode();
        }

        var freshUnfilled = await NewRoomAsync();

        var soloCreate = await player.PostAsync("/api/games", content: null);
        var solo = (await soloCreate.Content.ReadFromJsonAsync<GameResponse>())!.Id;

        // Backdate everything except the deliberately-fresh room.
        var old = fixture.Factory.TimeProvider.GetUtcNow().UtcDateTime.AddHours(-3);
        await using (var scope = Scope())
            await Db(scope).Games.Where(g => g.Id == staleUnfilled || g.Id == staleFilled || g.Id == solo)
                .ExecuteUpdateAsync(s => s.SetProperty(g => g.CreatedAtUtc, old));

        var cleanup = await admin.PostAsJsonAsync("/api/admin/rooms/cleanup", new AdminRoomCleanupRequest(OlderThanHours: 1));
        Assert.Equal(HttpStatusCode.OK, cleanup.StatusCode);
        Assert.Equal(1, (await cleanup.Content.ReadFromJsonAsync<AdminRoomCleanupResponse>())!.DeletedCount);

        await using (var scope = Scope())
        {
            var db = Db(scope);
            Assert.False(await db.Games.AnyAsync(g => g.Id == staleUnfilled));
            Assert.True(await db.Games.AnyAsync(g => g.Id == staleFilled));   // two seats -> kept
            Assert.True(await db.Games.AnyAsync(g => g.Id == freshUnfilled)); // too new -> kept
            Assert.True(await db.Games.AnyAsync(g => g.Id == solo));          // not a room -> kept
        }
    }

    [SkippableFact]
    public async Task List_games_filters_and_pages()
    {
        var (admin, _) = await NewAdminClientAsync();
        var gameId = await NewRatedRoomAsync();

        var rooms = await admin.GetFromJsonAsync<AdminGameListResponse>("/api/admin/games?rooms=true&status=InProgress&page=1&pageSize=10");
        Assert.NotNull(rooms);
        Assert.Contains(rooms!.Games, g => g.Id == gameId);
        Assert.All(rooms.Games, g =>
        {
            Assert.Equal("InProgress", g.Status);
            Assert.NotNull(g.JoinCode);
        });
        var mine = rooms.Games.Single(g => g.Id == gameId);
        Assert.NotNull(mine.P1DisplayName);
        Assert.NotNull(mine.P2DisplayName);

        var badStatus = await admin.GetAsync("/api/admin/games?status=Nope");
        Assert.Equal(HttpStatusCode.BadRequest, badStatus.StatusCode);
    }

    [SkippableFact]
    public async Task Stats_returns_live_counts()
    {
        var (admin, _) = await NewAdminClientAsync();
        await NewRatedRoomAsync();

        var stats = await admin.GetFromJsonAsync<AdminStats>("/api/admin/stats");
        Assert.NotNull(stats);
        Assert.True(stats!.TotalUsers > 0);
        Assert.True(stats.AdminCount >= 1);
        Assert.True(stats.GamesInProgress >= 1);
        Assert.True(stats.RatedGames >= 1);
    }

    // ---- bug reports ---------------------------------------------------------------------------

    private async Task<(Guid GameId, Guid ReportId, Guid UserId)> FileBugReportAsync()
    {
        var (client, auth, _) = await NewUserClientAsync("reporter");
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        var bundle = JsonSerializer.SerializeToElement(new { ring = new[] { "a", "b" } });
        var body = new BugReportRequest("P1", "conn-1", 3, "P1", "InProgress", 50, null, DateTime.UtcNow, bundle);
        var report = await client.PostAsJsonAsync($"/api/games/{game.Id}/bug-reports", body);
        Assert.Equal(HttpStatusCode.Created, report.StatusCode);
        var ack = (await report.Content.ReadFromJsonAsync<BugReportAck>())!;

        return (game.Id, ack.Id, auth.User.Id);
    }

    [SkippableFact]
    public async Task Bug_reports_list_filters_and_pages()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (gameId, reportId, userId) = await FileBugReportAsync();

        var filtered = await admin.GetFromJsonAsync<AdminBugReportListResponse>($"/api/admin/bug-reports?gameId={gameId}&page=1&pageSize=10");
        Assert.NotNull(filtered);
        Assert.Contains(filtered!.Reports, r => r.Id == reportId);
        Assert.All(filtered.Reports, r => Assert.Equal(gameId, r.GameId));

        var row = filtered.Reports.Single(r => r.Id == reportId);
        Assert.Equal(userId, row.UserId);
        Assert.NotNull(row.UserDisplayName);
        Assert.Equal("P1", row.Seat);
        Assert.Equal(3, row.MoveCount);

        var unfiltered = await admin.GetFromJsonAsync<AdminBugReportListResponse>("/api/admin/bug-reports?page=1&pageSize=1");
        Assert.NotNull(unfiltered);
        Assert.Equal(1, unfiltered!.Page);
        Assert.Equal(1, unfiltered.PageSize);
        Assert.True(unfiltered.Total >= 1);
    }

    [SkippableFact]
    public async Task Bug_report_detail_returns_the_full_bundle_and_404s_on_unknown_id()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (gameId, reportId, userId) = await FileBugReportAsync();

        var detail = await admin.GetFromJsonAsync<AdminBugReportDetail>($"/api/admin/bug-reports/{reportId}");
        Assert.NotNull(detail);
        Assert.Equal(gameId, detail!.GameId);
        Assert.Equal(userId, detail.UserId);
        Assert.Equal("conn-1", detail.ConnectionId);
        Assert.Equal("P1", detail.Turn);
        Assert.Equal("InProgress", detail.Status);
        Assert.Equal(50, detail.ServerOffsetMs);
        Assert.Equal("a", detail.Bundle.GetProperty("ring")[0].GetString());

        var missing = await admin.GetAsync($"/api/admin/bug-reports/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [SkippableFact]
    public async Task Deletes_a_bug_report_then_404s_on_repeat()
    {
        var (admin, _) = await NewAdminClientAsync();
        var (_, reportId, _) = await FileBugReportAsync();

        var del = await admin.DeleteAsync($"/api/admin/bug-reports/{reportId}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var again = await admin.DeleteAsync($"/api/admin/bug-reports/{reportId}");
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
    }
}
