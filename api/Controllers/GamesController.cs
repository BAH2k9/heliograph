using Khet.Api.Contracts;
using Khet.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Khet.Api.Controllers;

[ApiController]
[Route("api/games")]
public class GamesController(GameService games) : ControllerBase
{
    /// <summary>Creates a game in the Classic opening position with P1 to move.</summary>
    [HttpPost]
    public async Task<ActionResult<GameResponse>> Create(CancellationToken ct)
    {
        var game = await games.CreateAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = game.Id }, game);
    }

    /// <summary>Returns the current board plus whose turn it is.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GameResponse>> Get(Guid id, CancellationToken ct)
    {
        var game = await games.GetAsync(id, ct);
        return game is null
            ? NotFound(new MoveError($"no game with id {id}"))
            : Ok(game);
    }

    /// <summary>
    /// Validates and applies a move, auto-fires the mover's laser, and returns the resulting
    /// board, the ordered beam segments, and any eliminations. Illegal moves change nothing.
    /// </summary>
    [HttpPost("{id:guid}/moves")]
    public async Task<IActionResult> SubmitMove(Guid id, [FromBody] SubmitMoveRequest request, CancellationToken ct)
    {
        var result = await games.SubmitMoveAsync(id, request, ct);
        return result.Kind switch
        {
            SubmitMoveResult.ResultKind.Ok => Ok(result.Response),
            SubmitMoveResult.ResultKind.NotFound => NotFound(new MoveError($"no game with id {id}")),
            SubmitMoveResult.ResultKind.Finished => Conflict(new MoveError(result.Error!)),
            SubmitMoveResult.ResultKind.Illegal => BadRequest(new MoveError(result.Error!)),
            _ => throw new InvalidOperationException($"unhandled result kind {result.Kind}"),
        };
    }
}
