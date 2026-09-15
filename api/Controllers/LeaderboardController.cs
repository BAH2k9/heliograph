using Khet.Api.Domain;
using Khet.Api.Services;
using Khet.Clock;
using Khet.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Khet.Api.Controllers;

[ApiController]
[Route("api/leaderboard")]
// Was the one anonymous read endpoint in the app; now [Authorize] like every other controller bar
// HealthController. Nothing client-side ever needed it anonymous — /leaderboard renders inside
// AppLayout, which redirects a session-less visitor to /login (web/src/layout/AppLayout.tsx), so
// the page is unreachable without a token anyway. Left open it handed any unauthenticated caller
// the full roster of rated accounts, and the UserId values in it are exactly what
// POST /api/friends/requests and POST /api/invites take as input.
[Authorize]
public class LeaderboardController(LeaderboardService leaderboard) : ControllerBase
{
    /// <summary>
    /// Top accounts by rating within one time-control category, only those with at least one rated
    /// game in that category. <c>category</c> is required — one of <c>Bullet</c>/<c>Blitz</c>/
    /// <c>Rapid</c>/<c>Daily</c> (case-insensitive) — missing or unrecognized is a 400. <c>top</c>
    /// defaults to 50, clamps to 200.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<LeaderboardEntry>>> Get(
        [FromQuery] string? category, [FromQuery] int? top, CancellationToken ct)
    {
        if (!TimeControlCategories.TryParse(category, out var parsedCategory))
            return BadRequest(new MoveError($"unknown time control category '{category}'"));

        return Ok(await leaderboard.GetTopAsync(parsedCategory, top ?? LeaderboardService.DefaultTop, ct));
    }
}
