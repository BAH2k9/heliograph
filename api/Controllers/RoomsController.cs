using Khet.Api.Domain;
using Khet.Api.Services;
using Khet.Clock;
using Khet.Contracts;
using Khet.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Khet.Api.Controllers;

/// <summary>
/// Realtime rooms: a thin capability layer over a game. <c>POST /api/rooms</c> creates one and
/// seats the caller as P1; <c>POST /api/rooms/{code}/join</c> seats the next caller as P2 and
/// everyone after as a spectator. The returned seat is the only capability token. Class-level
/// <c>[Authorize]</c> means the caller always has a bearer token by the time either action runs —
/// their account id is threaded onto the seat via <see cref="AuthControllerHelpers.CurrentUserId"/>.
/// </summary>
[ApiController]
[Route("api/rooms")]
[Authorize]
public class RoomsController(RoomService rooms) : ControllerBase
{
    /// <summary>
    /// Creates a room and returns its shareable code with the caller seated as P1. The body is
    /// optional; <c>{ "ruleset": "...", "layout": "...", "timeControl": "..." }</c> — ruleset/layout
    /// default to <c>"Classic"</c>; timeControl defaults to null (untimed) when omitted. An unknown
    /// ruleset, layout, or time control name is a 400.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<RoomResponse>> Create(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] CreateRoomRequest? request,
        CancellationToken ct)
    {
        try
        {
            var room = await rooms.CreateRoomAsync(request, this.CurrentUserId(), ct);
            return Ok(room);
        }
        catch (Exception ex) when (ex is UnknownRuleSetException or UnknownBoardLayoutException or UnknownTimeControlException)
        {
            return BadRequest(new MoveError(ex.Message));
        }
    }

    /// <summary>Joins a room by code. First joiner gets P2; later joiners spectate. 404 if the code is unknown.</summary>
    [HttpPost("{code}/join")]
    public async Task<ActionResult<RoomResponse>> Join(string code, CancellationToken ct)
    {
        var room = await rooms.JoinRoomAsync(code, this.CurrentUserId(), ct);
        return room is null
            ? NotFound(new MoveError($"no room with code {code}"))
            : Ok(room);
    }
}
