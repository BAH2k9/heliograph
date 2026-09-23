using Heliograph.Api.Domain;
using Heliograph.Api.Mapping;
using Heliograph.Contracts;
using Heliograph.Engine;
using Heliograph.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using static Heliograph.Api.Services.GameHelpers;

namespace Heliograph.Api.Services;

// The submit-move cluster: the one method where engine + Move-row persist + clock + ending + the
// inline response build all converge. Irreducible orchestration — kept in its own file so the
// spine and every other partial stay small.
public sealed partial class GameService
{
    public async Task<SubmitMoveResult> SubmitMoveAsync(Guid id, SubmitMoveRequest request, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return SubmitMoveResult.NotFound();
        if (game.Status != GameStatus.InProgress)
            return SubmitMoveResult.Finished();

        // Captured once, up front — every clock decision this call makes (the expiry check right
        // below, the post-move AfterMove/NextDailyDeadline update, and the response's ServerNowUtc)
        // reads this same instant, never a fresh DateTime.UtcNow/time.GetUtcNow() per line. The
        // bot's follow-up move (below) reuses this same `now` too — its "thinking" delay is real
        // wall-clock time spent inside this one request, not a second clock read.
        var now = Now();

        // The mover may already have run out of time before this move ever arrived (slow to
        // submit, or they raced a claim-timeout and lost) — checked before validating the move at
        // all, so an expired mover can never sneak a move in. Mirrors ClaimTimeoutAsync's check;
        // both funnel into FinishByTimeoutAsync so a timeout resolves identically either way.
        if (clock.PreMoveExpiry(game, now))
        {
            await endService.FinishByTimeoutAsync(game, game.CurrentTurn, now, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            logger.LogInformation(
                "move rejected: {Mover}'s clock had already expired for game {GameId}, move never applied",
                game.CurrentTurn, game.Id);
            return SubmitMoveResult.TimedOut(new GameEndedResponse(game.Status.ToString(), game.EndReason!, now));
        }

        // Room games enforce the seat when the caller supplies one; direct /api/games play
        // (no JoinCode) and callers that omit Seat are unaffected.
        if (game.JoinCode is not null && request.Seat is { Length: > 0 } seat)
        {
            if (seat is not ("P1" or "P2"))
                return SubmitMoveResult.Illegal("spectators cannot move");
            if (seat != game.CurrentTurn.ToString())
                return SubmitMoveResult.Illegal("not your turn");
        }

        EngineMove move;
        try
        {
            move = BoardMapper.ToEngineMove(request);
        }
        catch (MoveRequestException ex)
        {
            return SubmitMoveResult.Illegal(ex.Message);
        }

        var rules = RuleSets.For(game.Ruleset);
        var board = BoardMapper.ToBoard(game.State);
        var validation = GameEngine.ValidateMove(board, move, game.CurrentTurn, rules);
        if (!validation.IsLegal)
            return SubmitMoveResult.Illegal(validation.Reason!);

        var mover = game.CurrentTurn;
        var response = await ApplyAndPersistAsync(game, move, mover, now, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return SubmitMoveResult.Ok(response);
    }

    /// <summary>
    /// If <paramref name="id"/>'s game is in progress and it's now the bot's own seat to move,
    /// computes (after an artificial "thinking" delay) and applies/persists the bot's reply in its
    /// own transaction, returning its <see cref="SubmitMoveResponse"/> — or null if it isn't
    /// actually the bot's turn (nothing to do).
    /// </summary>
    /// <remarks>
    /// Deliberately a <em>separate</em> call from <see cref="SubmitMoveAsync"/>, not folded back
    /// into it — <see cref="GamesController.SubmitMove"/> awaits this only after it has already
    /// broadcast the human move's own <c>moveApplied</c>. Bundling both plies into one call (the
    /// first cut of this feature) meant the artificial delay ran before either broadcast could go
    /// out, so the human's own move and the bot's reply arrived back-to-back the instant the whole
    /// request finally resolved — no visible pause, and (worse) the client's <c>submit()</c> held
    /// its own `busy` flag for that entire span, so even the human's own hub-pushed move sat queued
    /// behind it instead of animating. Splitting the call in two lets the human's move commit,
    /// broadcast, and animate immediately; the delay now genuinely separates the two plies instead
    /// of hiding inside one opaque round trip. Still not a background worker (claim-pattern
    /// convention) — it's a second awaited step of the same request, called from the same
    /// controller action.
    /// </remarks>
    public async Task<SubmitMoveResponse?> PlayBotReplyIfDueAsync(Guid id, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null || game.Status != GameStatus.InProgress || game.BotSeat != game.CurrentTurn)
            return null;

        var now = Now();
        var rules = RuleSets.For(game.Ruleset);
        var botMover = game.CurrentTurn;
        var botBoard = BoardMapper.ToBoard(game.State);
        var botMove = bot.ChooseMove(botBoard, botMover, rules, BotDifficulties.For(game.BotDifficulty!));

        // Real wall-clock delay, not tied to `time`/`now` — a FakeTimeProvider (used by
        // clock-expiry tests) would never advance on its own and this would hang forever if it
        // awaited a delay scheduled against it. BotService.NextThinkingDelay has its own test-only
        // override seam for integration tests that don't want to eat this for real.
        await Task.Delay(bot.NextThinkingDelay(), ct);

        var response = await ApplyAndPersistAsync(game, botMove, botMover, now, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return response;
    }

    /// <summary>
    /// Applies one already-validated <paramref name="move"/> to <paramref name="game"/>'s tracked
    /// state: engine apply + the mover's own laser fire, a new <see cref="Move"/> row, the
    /// clock/ending bookkeeping, and the <see cref="SubmitMoveResponse"/> wire shape — everything
    /// <see cref="SubmitMoveAsync"/> does for the human's own move, factored out so the bot's
    /// follow-up move (played through the exact same path) can't drift from it. Does not save or
    /// commit — the caller owns the one transaction/<c>SaveChangesAsync</c> for the whole request,
    /// same contract as <see cref="GameEndService"/>'s methods.
    /// </summary>
    private async Task<SubmitMoveResponse> ApplyAndPersistAsync(
        Game game, EngineMove move, Player mover, DateTime now, CancellationToken ct)
    {
        var board = BoardMapper.ToBoard(game.State);
        var afterMove = GameEngine.ApplyMove(board, move);
        var (afterLaser, outcome) = GameEngine.FireLaser(afterMove, mover);
        var status = GameEngine.CheckWin(afterLaser);
        var laserResult = BoardMapper.ToLaserResult(outcome, mover, afterMove);

        // Add to the DbSet (not game.Moves) so EF tracks it as Added — a client-set Guid key
        // discovered only via the navigation collection is otherwise treated as Modified.
        db.Moves.Add(new Move
        {
            Id = Guid.NewGuid(),
            GameId = game.Id,
            MoveNumber = game.MoveCount + 1,
            Player = mover,
            Type = move.Kind,
            FromRow = move.From.Row,
            FromCol = move.From.Col,
            ToRow = move.To?.Row,
            ToCol = move.To?.Col,
            RotationDir = move.Rotation,
            LaserResult = laserResult,
            CreatedAtUtc = now,
        });

        game.State = BoardMapper.ToState(afterLaser);
        game.MoveCount += 1;
        game.Status = status;
        if (status != GameStatus.InProgress)
        {
            // The Keep win is the one ending set inline rather than via
            // GameEndService.FinishGameAsync — the win status comes from GameEngine.CheckWin
            // mid-method, not from a `winner` argument. Elo still goes through the one shared path
            // (endService.ApplyEloAsync, below). Routing this through FinishGameAsync like the
            // other three endings is a known follow-up with its own behaviour-change budget
            // (the field-write order would change) — deliberately not done in this refactor.
            game.FinishedAtUtc = now;
            game.EndReason = "Keep";
        }
        else
        {
            // The game continues — bank the mover's clock (or reset Daily's deadline) for the
            // turn that just started. Skipped entirely for an untimed game (bot games always are,
            // v1), and for a timed room whose clock never actually started (TimeControl set but P2
            // hasn't joined yet — see InitializeClock's doc comment) rather than guessing a start
            // time that never happened.
            if (game.TimeControl is not null && game.TurnStartedAtUtc is { } turnStartedAtUtc)
                clock.UpdateClockAfterMove(game, mover, turnStartedAtUtc, now);
        }
        game.CurrentTurn = status == GameStatus.InProgress ? Other(mover) : mover;

        // Rated is only ever true when both seats were already authenticated at the moment they
        // were filled (see JoinRoomAsync) — which implies both UserIds are non-null here too. Never
        // true for a bot game (BotSeat implies Rated stays false — see Game.BotSeat's doc comment).
        if (status != GameStatus.InProgress && game.Rated)
            await endService.ApplyEloAsync(game, status, ct);

        logger.LogInformation(
            "move applied: {Mover} played move {MoveNumber} on game {GameId}, status now {Status}, turn now {CurrentTurn}",
            mover, game.MoveCount, game.Id, game.Status, game.CurrentTurn);

        return new SubmitMoveResponse(
            game.State,
            laserResult.Segments,
            laserResult.Eliminated,
            laserResult.Damaged,
            game.Status.ToString(),
            game.CurrentTurn.ToString(),
            game.MoveCount,
            game.TimeControl,
            game.P1RemainingMs,
            game.P2RemainingMs,
            game.TurnStartedAtUtc,
            game.TurnDeadlineUtc,
            now);
    }
}
