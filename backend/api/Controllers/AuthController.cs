using Heliograph.Api.Auth;
using Heliograph.Api.Domain;
using Heliograph.Api.Services;
using Heliograph.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Heliograph.Api.Controllers;

[ApiController]
[Route("api/auth")]
// No self-registration endpoint: accounts are admin-created only (AdminController's
// POST /api/admin/users), matching the "log in before you can touch anything" access model once
// this is exposed to the internet. AuthService.RegisterAsync still exists (unexposed over HTTP) —
// integration tests use it directly (see IntegrationFixture.RegisterAsync) to stand up test
// accounts without needing an authenticated admin caller.
public class AuthController(AuthService auth, ILogger<AuthController> logger) : ControllerBase
{
    /// <summary>
    /// Logs in by email or display name (<see cref="LoginRequest.Email"/> takes either; see
    /// <see cref="AuthService.LoginAsync"/>). 401 with a deliberately generic message on a bad
    /// login or password.
    ///
    /// The one rate-limited endpoint in the app (see <see cref="RateLimitOptions"/>): 10 attempts
    /// per client IP per 5 minutes by default, then 429. It's applied to the whole action, not just
    /// the failures — the limiter runs before the handler, so it can't know the outcome yet, and a
    /// legitimate user has no reason to log in ten times in five minutes either.
    ///
    /// Every failure is logged with the client IP the limiter partitioned on, so after an incident
    /// the log says who was guessing and at which account — the 401 itself stays generic.
    /// </summary>
    [EnableRateLimiting(RateLimitOptions.LoginPolicy)]
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var response = await auth.LoginAsync(request, ct);
        if (response is null)
        {
            // Capped at the longest legal email (a display name is at most 32): the field is
            // caller-controlled and unvalidated here, and the limiter is the only thing bounding
            // how often this line fires.
            var login = request.Email.Length > 254 ? request.Email[..254] : request.Email;
            logger.LogWarning("login failed for {Login} from {ClientIp}", login, HttpContext.Connection.RemoteIpAddress?.ToString());
            return Unauthorized(new AuthError("invalid login or password"));
        }
        return Ok(response);
    }

    /// <summary>Rotates the refresh token: the presented one is revoked, a new pair is issued. 401 if it's unknown/expired/already used.</summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshRequest request, CancellationToken ct)
    {
        var response = await auth.RefreshAsync(request.RefreshToken, ct);
        return response is null
            ? Unauthorized(new AuthError("invalid refresh token"))
            : Ok(response);
    }

    /// <summary>Revokes a refresh token. Always 204 — unknown/already-revoked tokens are a no-op, not an error.</summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshRequest request, CancellationToken ct)
    {
        await auth.LogoutAsync(request.RefreshToken, ct);
        return NoContent();
    }

    /// <summary>The current account, read fresh from the DB (so rating is never stale against the access token).</summary>
    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserProfile>> Me(CancellationToken ct)
    {
        var userId = this.CurrentUserId();
        if (userId is null)
            return Unauthorized();

        var profile = await auth.GetProfileAsync(userId.Value, ct);
        return profile is null ? Unauthorized() : Ok(profile);
    }

    /// <summary>
    /// Updates the caller's display name and/or avatar. Both fields optional; a null/omitted field
    /// leaves that part unchanged. 400 for an unknown avatar id or a blank display name, 401 if
    /// unauthenticated.
    /// </summary>
    [Authorize]
    [HttpPatch("me")]
    public async Task<ActionResult<UserProfile>> UpdateMe(PatchMeRequest request, CancellationToken ct)
    {
        var userId = this.CurrentUserId();
        if (userId is null)
            return Unauthorized();

        try
        {
            var profile = await auth.UpdateProfileAsync(userId.Value, request, ct);
            return profile is null ? Unauthorized() : Ok(profile);
        }
        catch (Exception ex) when (ex is UnknownAvatarException or AuthValidationException)
        {
            return BadRequest(new AuthError(ex.Message));
        }
    }
}
