using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Khet.Api.Contracts;
using Khet.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the auth API: register/login/refresh/logout/me over real HTTP against real
/// Postgres rows (Identity's tables + <c>RefreshTokens</c>). Skips when no Postgres is reachable,
/// same convention as the games/rooms integration tests.
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

    private static async Task<AuthResponse> RegisterAsync(HttpClient client, string? email = null, string? displayName = null)
    {
        var res = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email ?? UniqueEmail(), "correct-horse-1", displayName ?? "Player One"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    [SkippableFact]
    public async Task Register_creates_an_account_starting_at_1200_rating_and_returns_working_tokens()
    {
        var client = NewClient();
        var email = UniqueEmail();

        var auth = await RegisterAsync(client, email, "Player One");

        Assert.Equal(email, auth.User.Email);
        Assert.Equal("Player One", auth.User.DisplayName);
        Assert.Equal(1200, auth.User.Rating);
        Assert.Equal(0, auth.User.RatedGamesPlayed);
        Assert.False(string.IsNullOrWhiteSpace(auth.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(auth.RefreshToken));
        Assert.True(auth.AccessTokenExpiresAtUtc > DateTime.UtcNow);
        Assert.True(auth.RefreshTokenExpiresAtUtc > auth.AccessTokenExpiresAtUtc);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KhetDbContext>();
        var row = await db.Users.AsNoTracking().SingleAsync(u => u.Email == email);
        Assert.Equal("Player One", row.DisplayName);
        Assert.Equal(1200, row.Rating);
        // The refresh token is issued but never stored raw.
        var tokenRow = await db.RefreshTokens.AsNoTracking().SingleAsync(t => t.UserId == row.Id);
        Assert.NotEqual(auth.RefreshToken, tokenRow.TokenHash);
        Assert.Null(tokenRow.RevokedAtUtc);
    }

    [SkippableFact]
    public async Task Register_with_an_already_used_email_returns_409()
    {
        var client = NewClient();
        var email = UniqueEmail();
        await RegisterAsync(client, email);

        var res = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "another-pw-1", "Someone Else"));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<AuthError>();
        Assert.Contains(email, error!.Error);
    }

    [SkippableFact]
    public async Task Register_with_a_short_password_returns_400()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(UniqueEmail(), "short1", "Player"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [SkippableFact]
    public async Task Register_with_a_blank_display_name_returns_400()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(UniqueEmail(), "correct-horse-1", "   "));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<AuthError>();
        Assert.Contains("display name", error!.Error);
    }

    [SkippableFact]
    public async Task Login_with_correct_credentials_returns_tokens()
    {
        var client = NewClient();
        var email = UniqueEmail();
        await RegisterAsync(client, email);

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
    public async Task A_garbage_authorization_header_does_not_break_anonymous_game_creation()
    {
        // Regression guard: a stale/garbage bearer token from a previously logged-in browser
        // must not turn guest play into a 401 — POST /api/games has no [Authorize].
        var client = NewClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "garbage-not-a-jwt");

        var res = await client.PostAsync("/api/games", content: null);

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
    }
}
