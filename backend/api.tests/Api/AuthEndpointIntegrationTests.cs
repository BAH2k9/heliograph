using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Api.Services;
using Khet.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the auth API: login (including its rate limit)/refresh/logout/me over real
/// HTTP against real Postgres
/// rows (Identity's tables + <c>RefreshTokens</c>), plus <see cref="AuthService.RegisterAsync"/>
/// itself (there's no public HTTP register endpoint — accounts are admin-created; see
/// <c>AuthController</c>'s doc comment — but the underlying account-creation logic still needs
/// coverage, and every other test here needs a throwaway account to start from). Skips when no
/// Postgres is reachable, same convention as the games/rooms integration tests.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class AuthEndpointIntegrationTests(IntegrationFixture fixture)
{
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private static string UniqueEmail() => $"user-{Guid.NewGuid():N}@example.com";

    private Task<AuthResponse> RegisterAsync(HttpClient _, string? email = null, string? displayName = null) =>
        fixture.RegisterAsync(email, displayName);

    [SkippableFact]
    public async Task Register_creates_an_account_starting_at_1200_rating_in_all_4_categories_and_returns_working_tokens()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var email = UniqueEmail();

        var auth = await fixture.RegisterAsync(email, "Player One");

        Assert.Equal(email, auth.User.Email);
        Assert.Equal("Player One", auth.User.DisplayName);
        Assert.Equal(5, auth.User.Ratings.Count);
        Assert.All(auth.User.Ratings, bucket =>
        {
            Assert.Equal(1200, bucket.Rating);
            Assert.Equal(0, bucket.GamesPlayed);
        });
        Assert.Equal(
            new[] { "Bullet", "Blitz", "Rapid", "Daily", "Untimed" },
            auth.User.Ratings.Select(b => b.Category));
        Assert.False(string.IsNullOrWhiteSpace(auth.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(auth.RefreshToken));
        Assert.True(auth.AccessTokenExpiresAtUtc > DateTime.UtcNow);
        Assert.True(auth.RefreshTokenExpiresAtUtc > auth.AccessTokenExpiresAtUtc);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KhetDbContext>();
        var row = await db.Users.AsNoTracking().SingleAsync(u => u.Email == email);
        Assert.Equal("Player One", row.DisplayName);
        Assert.Equal(1200, row.BulletRating);
        Assert.Equal(1200, row.BlitzRating);
        Assert.Equal(1200, row.RapidRating);
        Assert.Equal(1200, row.DailyRating);
        Assert.Equal(1200, row.UntimedRating);
        // The refresh token is issued but never stored raw.
        var tokenRow = await db.RefreshTokens.AsNoTracking().SingleAsync(t => t.UserId == row.Id);
        Assert.NotEqual(auth.RefreshToken, tokenRow.TokenHash);
        Assert.Null(tokenRow.RevokedAtUtc);
    }

    [SkippableFact]
    public async Task Register_with_an_already_used_email_throws()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var email = UniqueEmail();
        await fixture.RegisterAsync(email);

        var ex = await Assert.ThrowsAsync<EmailAlreadyRegisteredException>(
            () => fixture.RegisterAsync(email, "Someone Else", "another-pw-1"));
        Assert.Contains(email, ex.Message);
    }

    [SkippableFact]
    public async Task Register_with_a_short_password_throws()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        await Assert.ThrowsAsync<AuthValidationException>(
            () => fixture.RegisterAsync(UniqueEmail(), "Player", "short1"));
    }

    [SkippableFact]
    public async Task Register_with_a_blank_display_name_throws()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        var ex = await Assert.ThrowsAsync<AuthValidationException>(
            () => fixture.RegisterAsync(UniqueEmail(), "   "));
        Assert.Contains("display name", ex.Message);
    }

    [SkippableFact]
    public async Task Login_with_correct_credentials_returns_tokens()
    {
        var client = NewClient();
        var email = UniqueEmail();
        await fixture.RegisterAsync(email);

        var res = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "correct-horse-1"));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var auth = await res.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.Equal(email, auth!.User.Email);
    }

    [SkippableFact]
    public async Task Login_with_the_wrong_password_returns_a_generic_401()
    {
        var client = NewClient();
        var email = UniqueEmail();
        await RegisterAsync(client, email);

        var res = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "totally-wrong-pw"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<AuthError>();
        Assert.Equal("invalid email or password", error!.Error);
    }

    [SkippableFact]
    public async Task Login_with_an_unknown_email_returns_the_same_generic_401()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(UniqueEmail(), "whatever-pw-1"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<AuthError>();
        Assert.Equal("invalid email or password", error!.Error);
    }

    [SkippableFact]
    public async Task Login_past_the_rate_limit_returns_429_with_a_retry_after_header()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        // Own server (own limiter partition cache) so spending the budget here can't 429 the
        // shared fixture's other tests — see IntegrationFixture.WithLoginLimit.
        await using var factory = fixture.WithLoginLimit(permitLimit: 3);
        var client = factory.CreateClient();
        var email = UniqueEmail();
        await fixture.RegisterAsync(email);
        var bad = new LoginRequest(email, "totally-wrong-pw");

        for (var attempt = 1; attempt <= 3; attempt++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", bad)).StatusCode);

        var limited = await client.PostAsJsonAsync("/api/auth/login", bad);

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.NotNull(limited.Headers.RetryAfter);
        // The {"error": "..."} shape the frontend's readError() parses, not a bare status code.
        var error = await limited.Content.ReadFromJsonAsync<AuthError>();
        Assert.Equal("too many login attempts, try again later", error!.Error);
    }

    // The two tests below pin the API's half of the client-IP contract with infra/Caddyfile: Caddy
    // replaces X-Forwarded-For with its resolved client IP, and the API partitions on exactly that.
    // TestServer requests have no peer address, so the test client stands where Caddy does.
    private static HttpRequestMessage LoginFrom(LoginRequest body, string forwardedFor, string? cfConnectingIp = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login") { Content = JsonContent.Create(body) };
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        if (cfConnectingIp is not null)
            request.Headers.Add("CF-Connecting-IP", cfConnectingIp);
        return request;
    }

    [SkippableFact]
    public async Task Login_rate_limit_partitions_on_the_forwarded_client_ip()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        await using var factory = fixture.WithLoginLimit(permitLimit: 2);
        var client = factory.CreateClient();
        var bad = new LoginRequest(UniqueEmail(), "totally-wrong-pw");

        for (var attempt = 1; attempt <= 2; attempt++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(LoginFrom(bad, "203.0.113.10"))).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.SendAsync(LoginFrom(bad, "203.0.113.10"))).StatusCode);

        // A different client behind the same proxy still has its own budget — the whole point:
        // behind the tunnel, one guesser must not lock every other caller out.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(LoginFrom(bad, "203.0.113.20"))).StatusCode);
    }

    [SkippableFact]
    public async Task Login_rate_limit_ignores_a_forged_cf_connecting_ip()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        await using var factory = fixture.WithLoginLimit(permitLimit: 2);
        var client = factory.CreateClient();
        var bad = new LoginRequest(UniqueEmail(), "totally-wrong-pw");

        // Caddy passes CF-Connecting-IP through from any peer, so a LAN caller can send one. Only
        // Caddy's trusted_proxies check may turn it into a client IP; if the API ever read it
        // directly, rotating the header would buy a fresh bucket per request.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(LoginFrom(bad, "192.168.0.50", "203.0.113.1"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(LoginFrom(bad, "192.168.0.50", "203.0.113.2"))).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.SendAsync(LoginFrom(bad, "192.168.0.50", "203.0.113.3"))).StatusCode);
    }

    [SkippableFact]
    public async Task Login_rate_limit_counts_correct_credentials_too_and_blocks_a_valid_password()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        await using var factory = fixture.WithLoginLimit(permitLimit: 2);
        var client = factory.CreateClient();
        var email = UniqueEmail();
        await fixture.RegisterAsync(email);
        var good = new LoginRequest(email, "correct-horse-1");

        // The limiter runs before the handler, so it can't know the outcome — successes spend
        // budget exactly like failures do.
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", good)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", good)).StatusCode);

        var limited = await client.PostAsJsonAsync("/api/auth/login", good);

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    [SkippableFact]
    public async Task Refresh_and_logout_are_not_rate_limited()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        // Only login carries [EnableRateLimiting] — a session refreshing normally must never be
        // throttled off the app, and a 32-random-byte refresh token isn't a guessing target.
        await using var factory = fixture.WithLoginLimit(permitLimit: 1);
        var client = factory.CreateClient();
        var auth = await fixture.RegisterAsync(UniqueEmail());

        var token = auth.RefreshToken;
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            var res = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(token));
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            token = (await res.Content.ReadFromJsonAsync<AuthResponse>())!.RefreshToken;
        }

        for (var attempt = 1; attempt <= 4; attempt++)
            Assert.Equal(
                HttpStatusCode.NoContent,
                (await client.PostAsJsonAsync("/api/auth/logout", new RefreshRequest(token))).StatusCode);
    }

    [SkippableFact]
    public async Task Refresh_rotates_the_token_and_the_old_one_stops_working()
    {
        var client = NewClient();
        var original = await RegisterAsync(client);

        var res = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(original.RefreshToken));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var rotated = (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.NotEqual(original.RefreshToken, rotated.RefreshToken);
        Assert.Equal(original.User.Id, rotated.User.Id);

        // Reusing the original (now-revoked) refresh token fails.
        var reuse = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(original.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);

        // The rotated token itself still works.
        var again = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(rotated.RefreshToken));
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
    }

    [SkippableFact]
    public async Task Refresh_with_an_unknown_token_returns_401()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest("not-a-real-token"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    public async Task Logout_revokes_the_token_and_is_idempotent()
    {
        var client = NewClient();
        var auth = await RegisterAsync(client);

        var first = await client.PostAsJsonAsync("/api/auth/logout", new RefreshRequest(auth.RefreshToken));
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);

        // Revoked, so a refresh attempt with it now fails.
        var refreshAttempt = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, refreshAttempt.StatusCode);

        // Logging out again (or with a token that was never real) is still a no-op success, not an error.
        var second = await client.PostAsJsonAsync("/api/auth/logout", new RefreshRequest(auth.RefreshToken));
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
        var unknown = await client.PostAsJsonAsync("/api/auth/logout", new RefreshRequest("never-issued"));
        Assert.Equal(HttpStatusCode.NoContent, unknown.StatusCode);
    }

    [SkippableFact]
    public async Task Me_requires_a_token_and_returns_the_live_profile()
    {
        var client = NewClient();

        var anonymous = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var garbage = fixture.Factory.CreateClient();
        garbage.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-real-jwt");
        var garbageRes = await garbage.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, garbageRes.StatusCode);

        var auth = await RegisterAsync(client);
        var authed = fixture.Factory.CreateClient();
        authed.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var meRes = await authed.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.OK, meRes.StatusCode);
        var profile = await meRes.Content.ReadFromJsonAsync<UserProfile>();
        Assert.Equal(auth.User.Id, profile!.Id);
        Assert.Equal(auth.User.Email, profile.Email);
        Assert.Equal(auth.User.DisplayName, profile.DisplayName);
    }

    [SkippableFact]
    public async Task Patch_me_updates_display_name_and_avatar_and_returns_the_updated_profile()
    {
        var client = NewClient();
        var auth = await RegisterAsync(client, displayName: "Original Name");
        var authed = fixture.Factory.CreateClient();
        authed.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        var res = await authed.PatchAsJsonAsync("/api/auth/me", new PatchMeRequest("New Name", "sphinx"));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var profile = await res.Content.ReadFromJsonAsync<UserProfile>();
        Assert.Equal("New Name", profile!.DisplayName);
        Assert.Equal("sphinx", profile.AvatarId);
        Assert.Equal(5, profile.Ratings.Count); // still the full Ratings shape from plan 03

        // A GET afterward reflects the same persisted values.
        var meRes = await authed.GetAsync("/api/auth/me");
        var reread = await meRes.Content.ReadFromJsonAsync<UserProfile>();
        Assert.Equal("New Name", reread!.DisplayName);
        Assert.Equal("sphinx", reread.AvatarId);
    }

    [SkippableFact]
    public async Task Patch_me_with_only_one_field_leaves_the_other_unchanged()
    {
        var client = NewClient();
        var auth = await RegisterAsync(client, displayName: "Keep My Name");
        var authed = fixture.Factory.CreateClient();
        authed.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        var avatarOnly = await authed.PatchAsJsonAsync("/api/auth/me", new PatchMeRequest(AvatarId: "ankh"));
        Assert.Equal(HttpStatusCode.OK, avatarOnly.StatusCode);
        var afterAvatar = await avatarOnly.Content.ReadFromJsonAsync<UserProfile>();
        Assert.Equal("Keep My Name", afterAvatar!.DisplayName);
        Assert.Equal("ankh", afterAvatar.AvatarId);

        var nameOnly = await authed.PatchAsJsonAsync("/api/auth/me", new PatchMeRequest(DisplayName: "Renamed"));
        Assert.Equal(HttpStatusCode.OK, nameOnly.StatusCode);
        var afterName = await nameOnly.Content.ReadFromJsonAsync<UserProfile>();
        Assert.Equal("Renamed", afterName!.DisplayName);
        Assert.Equal("ankh", afterName.AvatarId); // untouched by the name-only patch
    }

    [SkippableFact]
    public async Task Patch_me_with_an_unknown_avatar_returns_400()
    {
        var client = NewClient();
        var auth = await RegisterAsync(client);
        var authed = fixture.Factory.CreateClient();
        authed.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        var res = await authed.PatchAsJsonAsync("/api/auth/me", new PatchMeRequest(AvatarId: "not-a-real-avatar"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<AuthError>();
        Assert.Contains("not-a-real-avatar", error!.Error);
    }

    [SkippableFact]
    public async Task Patch_me_with_a_blank_display_name_returns_400()
    {
        var client = NewClient();
        var auth = await RegisterAsync(client);
        var authed = fixture.Factory.CreateClient();
        authed.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        var res = await authed.PatchAsJsonAsync("/api/auth/me", new PatchMeRequest(DisplayName: "   "));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<AuthError>();
        Assert.Contains("display name", error!.Error);
    }

    [SkippableFact]
    public async Task Patch_me_without_a_token_returns_401()
    {
        var client = NewClient();

        var res = await client.PatchAsJsonAsync("/api/auth/me", new PatchMeRequest(DisplayName: "Whoever"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [SkippableFact]
    public async Task A_garbage_authorization_header_is_treated_as_unauthenticated_not_a_500()
    {
        // Regression guard: a stale/garbage bearer token from a previously logged-in browser must
        // fail cleanly with the same 401 an absent token gets, not a 500 — GamesController requires
        // auth (guest play is gone), so this now asserts the rejection rather than a bypass of it.
        var client = NewClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "garbage-not-a-jwt");

        var res = await client.PostAsync("/api/games", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
