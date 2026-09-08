using Khet.Api.Domain;
using Khet.Api.Mapping;
using Khet.Contracts;
using Khet.Engine;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using static Khet.Api.Services.GameHelpers;

namespace Khet.Api.Services;

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
        // reads this same instant, never a fresh DateTime.UtcNow/time.GetUtcNow() per line.
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

        var board = BoardMapper.ToBoard(game.State);
        var rules = RuleSets.For(game.Ruleset);

        var validation = GameEngine.ValidateMove(board, move, game.CurrentTurn, rules);
        if (!validation.IsLegal)
            return SubmitMoveResult.Illegal(validation.Reason!);

        var mover = game.CurrentTurn;
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
            // The Pharaoh win is the one ending set inline rather than via
            // GameEndService.FinishGameAsync — the win status comes from GameEngine.CheckWin
            // mid-method, not from a `winner` argument. Elo still goes through the one shared path
            // (endService.ApplyEloAsync, below). Routing this through FinishGameAsync like the
            // other three endings is a known follow-up with its own behaviour-change budget
            // (the field-write order would change) — deliberately not done in this refactor.
            game.FinishedAtUtc = now;
            game.EndReason = "Pharaoh";
        }
        else
        {
            // The game continues — bank the mover's clock (or reset Daily's deadline) for the
            // turn that just started. Skipped entirely for an untimed game, and for a timed room
            // whose clock never actually started (TimeControl set but P2 hasn't joined yet — see
            // InitializeClock's doc comment) rather than guessing a start time that never happened.
            if (game.TimeControl is not null && game.TurnStartedAtUtc is { } turnStartedAtUtc)
                clock.UpdateClockAfterMove(game, mover, turnStartedAtUtc, now);
        }
        game.CurrentTurn = status == GameStatus.InProgress ? Other(mover) : mover;

        // Rated is only ever true when both seats were already authenticated at the moment they
        // were filled (see JoinRoomAsync) — which implies both UserIds are non-null here too.
        if (status != GameStatus.InProgress && game.Rated)
            await endService.ApplyEloAsync(game, status, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        var response = new SubmitMoveResponse(
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

        return SubmitMoveResult.Ok(response);
    }
}
