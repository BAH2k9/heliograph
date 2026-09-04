using Khet.Api.Contracts;
using Khet.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Khet.Api.Controllers;

[ApiController]
[Route("api/leaderboard")]
public class LeaderboardController(LeaderboardService leaderboard) : ControllerBase
{
    /// <summary>Top accounts by rating, only those with at least one rated game. <c>top</c> defaults to 50, clamps to 200.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<LeaderboardEntry>>> Get(
        [FromQuery] int? top, CancellationToken ct) =>
        Ok(await leaderboard.GetTopAsync(top ?? LeaderboardService.DefaultTop, ct));
}
