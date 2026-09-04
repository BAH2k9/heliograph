using Khet.Api.Contracts;
using Khet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Khet.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AuthService auth) : ControllerBase
{
    /// <summary>Creates an account and logs it in. 409 if the email is already registered, 400 on a validation error.</summary>
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        try
        {
            var response = await auth.RegisterAsync(request, ct);
            return CreatedAtAction(nameof(Me), null, response);
        }
        catch (EmailAlreadyRegisteredException ex)
        {
            return Conflict(new AuthError(ex.Message));
        }
        catch (AuthValidationException ex)
        {
            return BadRequest(new AuthError(ex.Message));
        }
    }

    /// <summary>401 with a deliberately generic message on a bad email or password.</summary>
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var response = await auth.LoginAsync(request, ct);
        return response is null
            ? Unauthorized(new AuthError("invalid email or password"))
            : Ok(response);
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
}
