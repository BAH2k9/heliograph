using Heliograph.Api.Hubs;
using Heliograph.Api.Mapping;
using Heliograph.Api.Services;
using Heliograph.Contracts;
using Heliograph.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace Heliograph.Api.Controllers;

/// <summary>
/// This is the one place with <c>HttpContext</c>/the <c>X-Trace-Id</c> request header, so it's also
/// the one place that stamps <see cref="SubmitMoveResponse.TraceId"/>/<see cref="GameEndedResponse.TraceId"/>
/// onto an already-built response via a <c>with</c> expression, rather than threading a
/// <c>string traceId</c> parameter through every <see cref="GameService"/> method that returns one
/// of those records unmodified (see <see cref="TraceIdFromRequest"/> and
/// backlog/10-bug-traceability.md). Each of those four call sites also opens an
/// <see cref="ILogger.BeginScope{TState}"/> around its <see cref="GameService"/> call — its scope
/// provider is shared per-factory, so that scope also enriches lines <see cref="GameService"/>
/// itself logs via its own separately-injected <c>ILogger&lt;GameService&gt;</c>, with no parameter
/// threading either.
/// </summary>
[ApiController]
[Route("api/games")]
[Authorize]
public class GamesController(GameService games, RoomService rooms, IHubContext<GameHub> hub, ILogger<GamesController> logger) : ControllerBase
{
    /// <summary>
    /// The caller-supplied <c>X-Trace-Id</c> header if present, else a fresh id — a request is
    /// never rejected for lacking one. This is the primary correlation key for anything with an
    /// HTTP request behind it (see the wire contract's "Correlation IDs" section).
    /// </summary>
    private string TraceIdFromRequest() =>
        Request.Headers.TryGetValue("X-Trace-Id", out var value) && value.Count > 0 && !string.IsNullOrWhiteSpace(value[0])
            ? value[0]!
            : Guid.NewGuid().ToString();

    /// <summary>
    /// Creates a game, P1 to move by default. The body is optional;
    /// <c>{ "ruleset": "...", "layout": "...", "firstPlayer": "..." }</c> — ruleset defaults
    /// to <c>"FixedSun"</c> and layout to <c>"Dawn"</c>, firstPlayer ("P1"/"P2") to P1. An unknown value for any of the three is a 400.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<GameResponse>> Create(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] CreateGameRequest? request,
        CancellationToken ct)
    {
        try
        {
            var game = await games.CreateAsync(request, this.CurrentUserId(), ct);
            return CreatedAtAction(nameof(Get), new { id = game.Id }, game);
        }
        catch (Exception ex) when (ex is UnknownRuleSetException or UnknownBoardLayoutException or MoveRequestException)
        {
            return BadRequest(new MoveError(ex.Message));
        }
    }

    /// <summary>
    /// Creates a bot game: one seat played by the server. Body:
    /// <c>{ "difficulty": "Easy"|"Medium"|"Hard", "ruleset": "...", "layout": "...", "playerSeat": "P1"|"P2" }</c>
    /// — <c>difficulty</c> is required (400 on an unknown name); <c>ruleset</c>/<c>layout</c> default
    /// as <see cref="Create"/>'s do; <c>playerSeat</c> (which seat the human takes) defaults to
    /// <c>"P1"</c>. Bot games are always unrated, matching local play — the caller must still be
    /// authenticated (class-level <c>[Authorize]</c>), that's just not what "unrated" refers to here.
    /// If the bot takes P1, its opening move is already applied in the response.
    /// </summary>
    [HttpPost("bot")]
    public async Task<ActionResult<GameResponse>> CreateBotGame(CreateBotGameRequest request, CancellationToken ct)
    {
        try
        {
            var game = await games.CreateBotGameAsync(request, this.CurrentUserId(), ct);
            return CreatedAtAction(nameof(Get), new { id = game.Id }, game);
        }
        catch (Exception ex) when (ex is UnknownRuleSetException or UnknownBoardLayoutException
            or UnknownDifficultyException or MoveRequestException)
        {
            return BadRequest(new MoveError(ex.Message));
        }
    }

    /// <summary>
    /// Lists games as lightweight summaries (no board state), newest first. With no query string,
    /// every game any account can see. <c>?mine=true</c> narrows that to games where the caller
    /// holds either seat.
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

    /// <summary>Returns the current board plus whose turn it is.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GameResponse>> Get(Guid id, CancellationToken ct)
    {
        var game = await games.GetAsync(id, this.CurrentUserId(), ct);
        return game is null
            ? NotFound(new MoveError($"no game with id {id}"))
            : Ok(game);
    }

    /// <summary>
    /// A trimmed public profile for one seat — no games list, no email, no account id — for the
    /// in-game player-info popup. Anyone who can view the game (including spectators) can call
    /// this; 400 for an unknown <paramref name="seat"/>, 404 if the game doesn't exist or that seat
    /// has no claimed account (bot/hotseat seat).
    /// </summary>
    [HttpGet("{id:guid}/players/{seat}")]
    public async Task<ActionResult<PublicPlayerProfile>> GetPlayerProfile(Guid id, string seat, CancellationToken ct)
    {
        try
        {
            var profile = await games.GetPlayerProfileAsync(id, seat, ct);
            return profile is null
                ? NotFound(new MoveError($"no claimed player for game {id} seat {seat}"))
                : Ok(profile);
        }
        catch (UnknownSeatException ex)
        {
            return BadRequest(new MoveError(ex.Message));
        }
    }

    /// <summary>
    /// Returns the game's starting board plus its full move history, oldest first. 410 if the game
    /// was played on a starting layout that has since been retired — its replay can't be rebuilt.
    /// </summary>
    [HttpGet("{id:guid}/moves")]
    public async Task<ActionResult<MoveHistoryResponse>> GetMoves(Guid id, CancellationToken ct)
    {
        try
        {
            var history = await games.GetMoveHistoryAsync(id, ct);
            return history is null
                ? NotFound(new MoveError($"no game with id {id}"))
                : Ok(history);
        }
        catch (UnknownBoardLayoutException ex)
        {
            return StatusCode(StatusCodes.Status410Gone,
                new MoveError($"this game was played on a retired starting layout ('{ex.Name}'), so its replay is no longer available"));
        }
    }

    /// <summary>
    /// Validates and applies a move, auto-fires the mover's laser, and returns the resulting
    /// board, the ordered beam segments, and any eliminations. Illegal moves change nothing.
    /// If the mover's clock had already expired when this arrived, the move is never applied —
    /// the game ends by timeout instead (409 + <see cref="GameEndedResponse"/>, broadcast as
    /// <c>gameEnded</c>, not <c>moveApplied</c>).
    /// <para>
    /// In a bot game, when this move hands the turn to the bot's seat, the bot's own reply is
    /// computed and applied next, in its own step — see
    /// <see cref="GameService.PlayBotReplyIfDueAsync"/>'s doc comment for why that's a separate call
    /// rather than folded into <see cref="GameService.SubmitMoveAsync"/> — only <em>after</em> the
    /// human move's own <c>moveApplied</c> has already broadcast. A second <c>moveApplied</c>
    /// broadcast fires for the bot's reply, and the HTTP response body reflects the board
    /// <em>after both plies</em> rather than just the human's, so a client gets both from one round
    /// trip without a follow-up <c>GET</c>.
    /// </para>
    /// </summary>
    [HttpPost("{id:guid}/moves")]
    public async Task<IActionResult> SubmitMove(Guid id, [FromBody] SubmitMoveRequest request, CancellationToken ct)
    {
        var traceId = TraceIdFromRequest();
        SubmitMoveResult result;
        using (logger.BeginScope(new Dictionary<string, object?> { ["TraceId"] = traceId, ["GameId"] = id }))
        {
            result = await games.SubmitMoveAsync(id, request, ct);
        }

        logger.LogInformation("submit-move {GameId} {TraceId}: {ResultKind}", id, traceId, result.Kind);

        // REST stays the source of truth; the hub only fans the accepted result out to
        // everyone in the game's group (the submitter included — the client drops the echo
        // by move number). An empty group is a no-op.
        if (result.Kind == SubmitMoveResult.ResultKind.Ok)
        {
            var response = result.Response! with { TraceId = traceId };
            await hub.Clients.Group(id.ToString()).SendAsync("moveApplied", response, ct);

            SubmitMoveResponse? botResponse;
            using (logger.BeginScope(new Dictionary<string, object?> { ["TraceId"] = traceId, ["GameId"] = id }))
            {
                botResponse = await games.PlayBotReplyIfDueAsync(id, ct);
            }
            if (botResponse is not null)
            {
                botResponse = botResponse with { TraceId = traceId };
                await hub.Clients.Group(id.ToString()).SendAsync("moveApplied", botResponse, ct);
            }

            // The bot's follow-up (if any) is the caller-visible outcome of this request — it's the
            // state the game is actually in by the time the HTTP response arrives.
            return Ok(botResponse ?? response);
        }

        if (result.Kind == SubmitMoveResult.ResultKind.TimedOut)
        {
            var gameEnded = result.GameEnded! with { TraceId = traceId };
            await hub.Clients.Group(id.ToString()).SendAsync("gameEnded", gameEnded, ct);
        }

        return result.Kind switch
        {
            SubmitMoveResult.ResultKind.NotFound => NotFound(new MoveError($"no game with id {id}")),
            SubmitMoveResult.ResultKind.Finished => Conflict(new MoveError(result.Error!)),
            SubmitMoveResult.ResultKind.Illegal => BadRequest(new MoveError(result.Error!)),
            // Superset of MoveError's { "error": ... } shape — every existing 4xx caller's shared
            // handler keeps working unmodified, while a clock-aware caller gets the rest inline
            // instead of a follow-up GET. See MoveTimedOutError's doc comment.
            SubmitMoveResult.ResultKind.TimedOut => Conflict(new MoveTimedOutError(
                "your clock ran out", result.GameEnded!.Status, result.GameEnded.EndReason, result.GameEnded.ServerNowUtc)),
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
        var traceId = TraceIdFromRequest();
        try
        {
            ClaimTimeoutResponse? result;
            using (logger.BeginScope(new Dictionary<string, object?> { ["TraceId"] = traceId, ["GameId"] = id }))
            {
                result = await games.ClaimTimeoutAsync(id, ct);
            }
            if (result is null)
                return NotFound(new MoveError($"no game with id {id}"));

            logger.LogInformation("claim-timeout {GameId} {TraceId}: {Status}", id, traceId, result.Status);

            var gameEnded = new GameEndedResponse(result.Status, result.EndReason, result.ServerNowUtc, traceId);
            await hub.Clients.Group(id.ToString()).SendAsync("gameEnded", gameEnded, ct);

            return Ok(result);
        }
        catch (ClaimTimeoutException ex)
        {
            return Conflict(new MoveError(ex.Message));
        }
    }

    /// <summary>
    /// Authoritatively resolves a claimed abandonment against the *other* seat's server-tracked
    /// disconnect timestamp (never the caller's own say-so) — 200 + <see cref="ClaimAbandonmentResponse"/>
    /// and a <c>gameEnded</c> broadcast once that seat has genuinely been disconnected at least 45s,
    /// 409 if it isn't tracked as disconnected at all, hasn't been long enough yet, or the game
    /// already finished, 404 if the game doesn't exist. <see cref="ClaimAbandonmentRequest.Seat"/>
    /// is the caller's own seat ("my opponent abandoned, I win").
    /// </summary>
    [HttpPost("{id:guid}/claim-abandonment")]
    public async Task<IActionResult> ClaimAbandonment(Guid id, ClaimAbandonmentRequest request, CancellationToken ct)
    {
        var traceId = TraceIdFromRequest();
        try
        {
            ClaimAbandonmentResponse? result;
            using (logger.BeginScope(new Dictionary<string, object?> { ["TraceId"] = traceId, ["GameId"] = id }))
            {
                result = await games.ClaimAbandonmentAsync(id, request.Seat, ct);
            }
            if (result is null)
                return NotFound(new MoveError($"no game with id {id}"));

            logger.LogInformation("claim-abandonment {GameId} {TraceId}: {Status}", id, traceId, result.Status);

            var gameEnded = new GameEndedResponse(result.Status, result.EndReason, result.ServerNowUtc, traceId);
            await hub.Clients.Group(id.ToString()).SendAsync("gameEnded", gameEnded, ct);

            return Ok(result);
        }
        catch (ClaimAbandonmentException ex)
        {
            return Conflict(new MoveError(ex.Message));
        }
    }

    /// <summary>
    /// Concedes the game on behalf of <c>seat</c> — the *other* seat wins, <c>EndReason</c> is
    /// <c>"Resignation"</c>. <c>seat</c> ("P1"/"P2") is always required, room game or not, since
    /// it's the only way the server knows who's conceding — 400 if it's missing or anything else,
    /// 409 if the game isn't in progress, 404 if it doesn't exist.
    /// </summary>
    [HttpPost("{id:guid}/resign")]
    public async Task<IActionResult> Resign(
        Guid id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ResignRequest? request,
        CancellationToken ct)
    {
        var traceId = TraceIdFromRequest();
        try
        {
            ResignResponse? result;
            using (logger.BeginScope(new Dictionary<string, object?> { ["TraceId"] = traceId, ["GameId"] = id }))
            {
                result = await games.ResignAsync(id, request?.Seat, ct);
            }
            if (result is null)
                return NotFound(new MoveError($"no game with id {id}"));

            logger.LogInformation("resign {GameId} {TraceId}: {Status}", id, traceId, result.Status);

            var gameEnded = new GameEndedResponse(result.Status, result.EndReason, result.ServerNowUtc, traceId);
            await hub.Clients.Group(id.ToString()).SendAsync("gameEnded", gameEnded, ct);

            return Ok(result);
        }
        catch (ResignException ex)
        {
            return ex.Conflict ? Conflict(new MoveError(ex.Message)) : BadRequest(new MoveError(ex.Message));
        }
    }

    /// <summary>
    /// "I want a rematch" — see <see cref="RoomService.RequestRematchAsync"/> for the propose/match
    /// shape (no separate accept step: the second seat's own call to this same endpoint is what
    /// creates the room). <c>request.Seat</c> ("P1"/"P2") is the caller's own seat, same trust model
    /// as <see cref="Resign"/>'s. 202 (empty body) while still waiting on the other seat — also
    /// pushes <c>rematchOffered { seat }</c> to the game's group so the *other* seat's client shows
    /// the "opponent wants a rematch" banner. 200 + <see cref="RoomResponse"/> once both seats have
    /// asked — also pushes <c>rematchReady { gameId, code }</c> to the group so <em>both</em> clients
    /// (including the original requester, who was sitting on "waiting for opponent") auto-enter the
    /// new room; each client works out its own new seat locally by flipping the seat it already
    /// holds, since seats always swap on a rematch. 400 for an unknown seat or a non-room game, 409
    /// if the game is still <c>InProgress</c>, 404 if it doesn't exist.
    /// </summary>
    [HttpPost("{id:guid}/rematch")]
    public async Task<IActionResult> Rematch(Guid id, RematchRequest request, CancellationToken ct)
    {
        try
        {
            var outcome = await rooms.RequestRematchAsync(id, request.Seat, DateTime.UtcNow, ct);
            if (outcome is null)
                return NotFound(new MoveError($"no game with id {id}"));

            if (!outcome.Matched)
            {
                await hub.Clients.Group(id.ToString()).SendAsync("rematchOffered", new { seat = request.Seat }, ct);
                return StatusCode(StatusCodes.Status202Accepted);
            }

            logger.LogInformation("rematch {GameId}: matched -> new game {NewGameId}", id, outcome.Room!.GameId);
            await hub.Clients.Group(id.ToString())
                .SendAsync("rematchReady", new { gameId = outcome.Room.GameId, code = outcome.Room.Code }, ct);
            return Ok(outcome.Room);
        }
        catch (RematchException ex)
        {
            return ex.Conflict ? Conflict(new MoveError(ex.Message)) : BadRequest(new MoveError(ex.Message));
        }
    }

    /// <summary>
    /// Withdraws a rematch request — see <see cref="RoomService.DeclineRematchAsync"/>. Resets both
    /// seats' pending requests (not just the decliner's), so the original requester's "waiting for
    /// opponent" button resets rather than staying stamped for some later unrelated click to match
    /// against. Pushes <c>rematchDeclined { seat }</c> so the original requester's UI can reset back
    /// to a plain "Play again" button. 204 on success (also 204 if nobody had requested anything —
    /// harmless), 400 for an unknown seat, 404 if the game doesn't exist.
    /// </summary>
    [HttpPost("{id:guid}/rematch/decline")]
    public async Task<IActionResult> DeclineRematch(Guid id, RematchRequest request, CancellationToken ct)
    {
        try
        {
            var found = await rooms.DeclineRematchAsync(id, request.Seat, ct);
            if (!found)
                return NotFound(new MoveError($"no game with id {id}"));

            await hub.Clients.Group(id.ToString()).SendAsync("rematchDeclined", new { seat = request.Seat }, ct);
            return NoContent();
        }
        catch (RematchException ex)
        {
            return BadRequest(new MoveError(ex.Message));
        }
    }

    /// <summary>
    /// Stores one client-filed bug report bundle for later manual diagnosis (see
    /// backlog/10-bug-traceability.md). <c>id</c> is the authoritative <see cref="Domain.Game.Id"/> —
    /// never taken from the body. <see cref="RequestSizeLimitAttribute"/> is the primary anti-abuse
    /// control (retention is manual admin-only deletion, not automatic pruning — owner decision);
    /// the explicit <c>Request.ContentLength</c> recheck below backs it up because that attribute
    /// only takes effect at the Kestrel/IIS transport layer, which the in-memory TestServer used by
    /// the integration test suite doesn't emulate — without it, an oversize bundle 201s under tests
    /// while still correctly 413ing in production.
    /// Deliberately does not broadcast anything over <see cref="GameHub"/> — write-and-store only,
    /// no other client needs to know a bug report was filed. 404 if the game doesn't exist.
    /// </summary>
    [HttpPost("{id:guid}/bug-reports")]
    [RequestSizeLimit(262_144)]
    public async Task<IActionResult> ReportBug(Guid id, BugReportRequest request, CancellationToken ct)
    {
        if (Request.ContentLength is > 262_144)
            return StatusCode(StatusCodes.Status413PayloadTooLarge);

        if (!await games.GameExistsAsync(id, ct))
            return NotFound(new MoveError($"no game with id {id}"));

        // A missing/null "bundle" in the body leaves this default(JsonElement) (ValueKind
        // Undefined) rather than a genuine JSON value — GetRawText() throws on that, so reject it
        // as a 400 here rather than letting it surface as a 500 from SaveBugReportAsync.
        if (request.Bundle.ValueKind == JsonValueKind.Undefined)
            return BadRequest(new MoveError("bundle is required"));

        BugReportAck ack;
        using (logger.BeginScope(new Dictionary<string, object?> { ["TraceId"] = request.LastTraceId, ["GameId"] = id }))
        {
            ack = await games.SaveBugReportAsync(id, this.CurrentUserId(), request, ct);
        }

        logger.LogInformation("bug report {BugReportId} filed for game {GameId}", ack.Id, id);

        return StatusCode(201, ack);
    }
}
