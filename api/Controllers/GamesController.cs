using Khet.Api.Contracts;
using Khet.Api.Engine;
using Khet.Api.Hubs;
using Khet.Api.Mapping;
using Khet.Api.Services;
using Microsoft.AspNetCore.Authorization;
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

    /// <summary>
    /// Lists games as lightweight summaries (no board state), newest first. With no query string,
    /// all games (401-free, matches guest play). <c>?mine=true</c> filters to games where the
    /// caller holds either seat — requires a valid bearer token, 401 without one.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<GameSummary>>> List([FromQuery] bool mine, CancellationToken ct)
    {
        if (!mine)
            return Ok(await games.ListGamesAsync(mine: null, ct));

        var userId = this.CurrentUserId();
        if (userId is null)
            return Unauthorized(new MoveError("login required to filter your own games"));

        return Ok(await games.ListGamesAsync(userId, ct));
    }

    /// <summary>
    /// Attaches the caller's account to a seat on a room game — for someone who was anonymous when
    /// they created/joined and logged in afterward. Shows the game in their <c>?mine=true</c>
    /// archive; never makes an already-unrated game rated. 400 on a non-room game or unknown seat,
    /// 409 if someone else already holds that seat, 404 if the game doesn't exist.
    /// </summary>
    [Authorize]
    [HttpPost("{id:guid}/claim-seat")]
    public async Task<ActionResult<ClaimSeatResponse>> ClaimSeat(Guid id, ClaimSeatRequest request, CancellationToken ct)
    {
        var userId = this.CurrentUserId();
        if (userId is null)
            return Unauthorized();

        try
        {
            var result = await games.ClaimSeatAsync(id, userId.Value, request.Seat, ct);
            return result is null
                ? NotFound(new MoveError($"no game with id {id}"))
                : Ok(result);
        }
        catch (ClaimSeatException ex)
        {
            return ex.Conflict ? Conflict(new MoveError(ex.Message)) : BadRequest(new MoveError(ex.Message));
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

    /// <summary>Returns the game's starting board plus its full move history, oldest first.</summary>
    [HttpGet("{id:guid}/moves")]
    public async Task<ActionResult<MoveHistoryResponse>> GetMoves(Guid id, CancellationToken ct)
    {
        var history = await games.GetMoveHistoryAsync(id, ct);
        return history is null
            ? NotFound(new MoveError($"no game with id {id}"))
            : Ok(history);
    }

    /// <summary>
    /// Validates and applies a move, auto-fires the mover's laser, and returns the resulting
    /// board, the ordered beam segments, and any eliminations. Illegal moves change nothing.
    /// If the mover's clock had already expired when this arrived, the move is never applied —
    /// the game ends by timeout instead (409 + <see cref="GameEndedResponse"/>, broadcast as
    /// <c>gameEnded</c>, not <c>moveApplied</c>).
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
        else if (result.Kind == SubmitMoveResult.ResultKind.TimedOut)
            await hub.Clients.Group(id.ToString()).SendAsync("gameEnded", result.GameEnded, ct);

        return result.Kind switch
        {
            SubmitMoveResult.ResultKind.Ok => Ok(result.Response),
            SubmitMoveResult.ResultKind.NotFound => NotFound(new MoveError($"no game with id {id}")),
            SubmitMoveResult.ResultKind.Finished => Conflict(new MoveError(result.Error!)),
            SubmitMoveResult.ResultKind.Illegal => BadRequest(new MoveError(result.Error!)),
            SubmitMoveResult.ResultKind.TimedOut => Conflict(result.GameEnded),
            _ => throw new InvalidOperationException($"unhandled result kind {result.Kind}"),
        };
    }

    /// <summary>
    /// Authoritatively resolves a claimed timeout against the server's own clock (never the
    /// caller's say-so) — 200 + <see cref="ClaimTimeoutResponse"/> and a <c>gameEnded</c> broadcast
    /// if <see cref="Domain.Game.TurnDeadlineUtc"/> had genuinely passed, 409 (no-op) if not
    /// actually expired yet or the game already finished, 404 if the game doesn't exist.
    /// </summary>
    [HttpPost("{id:guid}/claim-timeout")]
    public async Task<IActionResult> ClaimTimeout(Guid id, CancellationToken ct)
    {
        try
        {
            var result = await games.ClaimTimeoutAsync(id, ct);
            if (result is null)
                return NotFound(new MoveError($"no game with id {id}"));

            var gameEnded = new GameEndedResponse(result.Status, result.EndReason, result.ServerNowUtc);
            await hub.Clients.Group(id.ToString()).SendAsync("gameEnded", gameEnded, ct);

            return Ok(result);
        }
        catch (ClaimTimeoutException ex)
        {
            return Conflict(new MoveError(ex.Message));
        }
    }
}
