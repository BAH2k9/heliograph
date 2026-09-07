using Khet.Api.Contracts;
using Khet.Api.Domain;
using Khet.Api.Services;
using Khet.Clock;
using Microsoft.AspNetCore.Mvc;

namespace Khet.Api.Controllers;

[ApiController]
[Route("api/leaderboard")]
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
