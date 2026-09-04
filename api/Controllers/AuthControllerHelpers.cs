using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Khet.Api.Controllers;

/// <summary>
/// Shared helper for controllers that work whether or not the caller is authenticated (rooms,
/// game listing) — as opposed to <c>[Authorize]</c>, which requires it. <c>UseAuthentication()</c>
/// runs the JWT handler for every request regardless of <c>[Authorize]</c>, so <c>User</c> is
/// already populated here when a valid bearer token was presented; this just reads it back out.
/// </summary>
public static class AuthControllerHelpers
{
    /// <summary>The caller's account id from the <c>sub</c> claim, or null if unauthenticated/no valid token.</summary>
    public static Guid? CurrentUserId(this ControllerBase controller) =>
        Guid.TryParse(controller.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, out var id) ? id : null;
}
