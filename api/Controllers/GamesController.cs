using Khet.Api.Contracts;
using Khet.Api.Engine;
using Khet.Api.Hubs;
using Khet.Api.Mapping;
using Khet.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.SignalR;

namespace Khet.Api.Controllers;

[ApiController]
[Route("api/games")]
public class GamesController(GameService games, IHubContext<GameHub> hub) : ControllerBase
{
    /// <summary>
    /// Creates a game, P1 to move by default. The body is optional;
    /// <c>{ "ruleset": "...", "layout": "...", "firstPlayer": "..." }</c> — ruleset/layout default
    /// to <c>"Classic"</c>, firstPlayer ("P1"/"P2") to P1. An unknown value for any of the three is a 400.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<GameResponse>> Create(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] CreateGameRequest? request,
        CancellationToken ct)
    {
        try
        {
            var game = await games.CreateAsync(request, ct);
            return CreatedAtAction(nameof(Get), new { id = game.Id }, game);
        }
        catch (Exception ex) when (ex is UnknownRuleSetException or UnknownBoardLayoutException or MoveRequestException)
        {
            return BadRequest(new MoveError(ex.Message));
        }
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

        // REST stays the source of truth; the hub only fans the accepted result out to
        // everyone in the game's group (the submitter included — the client drops the echo
        // by move number). An empty group is a no-op.
        if (result.Kind == SubmitMoveResult.ResultKind.Ok)
            await hub.Clients.Group(id.ToString()).SendAsync("moveApplied", result.Response, ct);

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
