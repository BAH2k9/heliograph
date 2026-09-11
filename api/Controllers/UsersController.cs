using Khet.Api.Services;
using Khet.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Khet.Api.Controllers;

/// <summary>
/// Account discovery for the friends feature — search only, nothing else lives here yet.
/// <see cref="FriendService"/> owns the query since it's the only consumer.
/// </summary>
[Authorize]
[ApiController]
[Route("api/users")]
public class UsersController(FriendService friends) : ControllerBase
{
    /// <summary>
    /// Case-insensitive contains match on <c>DisplayName</c>, up to 20 hits, excluding the caller.
    /// 400 if <c>q</c> is missing/blank.
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<UserSearchResult>>> Search([FromQuery] string? q, CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new MoveError("q must not be blank"));

        return Ok(await friends.SearchUsersAsync(callerId.Value, q.Trim(), ct));
    }
}
