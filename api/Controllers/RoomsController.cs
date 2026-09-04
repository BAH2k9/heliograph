using Khet.Api.Contracts;
using Khet.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Khet.Api.Controllers;

/// <summary>
/// Realtime rooms: a thin capability layer over a game. <c>POST /api/rooms</c> creates one and
/// seats the caller as P1; <c>POST /api/rooms/{code}/join</c> seats the next caller as P2 and
/// everyone after as a spectator. The returned seat is the only token — no account auth.
/// </summary>
[ApiController]
[Route("api/rooms")]
public class RoomsController(GameService games) : ControllerBase
{
    /// <summary>Creates a room and returns its shareable code with the caller seated as P1.</summary>
    [HttpPost]
    public async Task<ActionResult<RoomResponse>> Create(CancellationToken ct)
    {
        var room = await games.CreateRoomAsync(ct);
        return Ok(room);
    }

    /// <summary>Joins a room by code. First joiner gets P2; later joiners spectate. 404 if the code is unknown.</summary>
    [HttpPost("{code}/join")]
    public async Task<ActionResult<RoomResponse>> Join(string code, CancellationToken ct)
    {
        var room = await games.JoinRoomAsync(code, ct);
        return room is null
            ? NotFound(new MoveError($"no room with code {code}"))
            : Ok(room);
    }
}
