using Khet.Api.Contracts;
using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Clock;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using static Khet.Api.Services.GameHelpers;

namespace Khet.Api.Services;

// Claims + resign + the game-ending core. The three [TX] entry points (ClaimTimeout,
// ClaimAbandonment, Resign) share the "claim pattern" skeleton and all funnel into FinishGameAsync,
// which sets the win fields and applies Elo but NEVER saves or commits — the caller owns its
// transaction. AbandonmentGraceSeconds lives here (it's the check, not the tracking).
public sealed partial class GameService
{
    /// <summary>
    /// How long the *other* seat's connection must have been tracked as disconnected before
    /// <see cref="ClaimAbandonmentAsync"/> will accept a claim against it. A tunable constant, not
    /// a product negotiation (owner decision, plans/02-disconnect-abandonment.md).
    /// </summary>
    private const int AbandonmentGraceSeconds = 45;

    /// <summary>
    /// Authoritatively resolves a claimed timeout against the server's own clock — never trusts
    /// the caller's own notion of "it's expired". Same one-mechanism-for-everything shape as
    /// <see cref="SubmitMoveAsync"/>'s pre-validation check: both funnel into
    /// <see cref="FinishByTimeoutAsync"/> so a timeout resolves identically whether it's caught by
    /// a submitted move or by this endpoint. Throws <see cref="ClaimTimeoutException"/> (→ 409) if
    /// the game isn't in progress, or if <see cref="Game.TurnDeadlineUtc"/> genuinely hasn't passed
    /// yet (including an untimed game, where it's always null). Null if no game has this id.
    /// </summary>
    public async Task<ClaimTimeoutResponse?> ClaimTimeoutAsync(Guid id, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return null;

        if (game.Status != GameStatus.InProgress)
            throw new ClaimTimeoutException("game is already finished");

        var now = Now();
        if (!ClockMath.HasExpired(game.TurnDeadlineUtc, now))
        {
            // Covers both "genuinely not expired yet" and "this game has no deadline at all"
            // (untimed, or a timed room whose clock hasn't started — TurnDeadlineUtc null either
            // way) — HasExpired treats null the same as not-yet-expired, so one message covers both.
            throw new ClaimTimeoutException(
                game.TurnDeadlineUtc is null ? "this game has no clock to time out" : "not yet expired");
        }

        await FinishByTimeoutAsync(game, game.CurrentTurn, now, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return new ClaimTimeoutResponse(game.Id, game.Status.ToString(), game.EndReason!, now);
    }

    /// <summary>
    /// Authoritatively resolves a claimed abandonment against the *other* seat's server-tracked
    /// disconnect timestamp — never trusts the caller's own say-so, same shape as
    /// <see cref="ClaimTimeoutAsync"/>. <paramref name="seat"/> is the caller's own seat ("my
    /// opponent abandoned, I win"). Applies to every game regardless of time control — untimed and
    /// Daily rooms are the actual motivating case, since they have no other resolution path (see
    /// plan's "Owner decisions already made"). Throws <see cref="ClaimAbandonmentException"/>
    /// (→ 409) if the game has already finished, if the other seat has no disconnect tracked at
    /// all, or if it's tracked but hasn't been <see cref="AbandonmentGraceSeconds"/> yet. Null if
    /// no game has this id.
    /// </summary>
    public async Task<ClaimAbandonmentResponse?> ClaimAbandonmentAsync(Guid id, string seat, CancellationToken ct = default)
    {
        if (seat is not ("P1" or "P2"))
            throw new ClaimAbandonmentException($"unknown seat '{seat}'");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return null;

        if (game.Status != GameStatus.InProgress)
            throw new ClaimAbandonmentException("game is already finished");

        var callerSeat = seat == "P1" ? Player.P1 : Player.P2;
        var opponentSeat = Other(callerSeat);
        var opponentDisconnectedAt = DisconnectedAt(game, opponentSeat);

        if (opponentDisconnectedAt is null)
            throw new ClaimAbandonmentException("opponent is not disconnected");

        var now = Now();
        if ((now - opponentDisconnectedAt.Value).TotalSeconds < AbandonmentGraceSeconds)
            throw new ClaimAbandonmentException("opponent has not been disconnected long enough");

        await FinishGameAsync(game, winner: callerSeat, "Abandonment", now, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return new ClaimAbandonmentResponse(game.Id, game.Status.ToString(), game.EndReason!, now);
    }

    /// <summary>
    /// Shared by <see cref="SubmitMoveAsync"/>'s pre-validation check and
    /// <see cref="ClaimTimeoutAsync"/>: ends the game exactly like an ordinary decisive win —
    /// reusing <see cref="GameStatus"/>'s existing <c>P1Win</c>/<c>P2Win</c> values and the same
    /// <see cref="ApplyEloAsync"/> trigger point — except <see cref="Game.EndReason"/> is
    /// <c>"Timeout"</c> rather than <c>"Pharaoh"</c>, and the mover who ran out is the loser.
    /// Does not save or commit — the caller owns its own transaction.
    /// </summary>
    private async Task FinishByTimeoutAsync(Game game, Player timedOutPlayer, DateTime now, CancellationToken ct) =>
        await FinishGameAsync(game, winner: Other(timedOutPlayer), "Timeout", now, ct);

    /// <summary>
    /// Shared by <see cref="ResignAsync"/>: same shape as <see cref="FinishByTimeoutAsync"/> —
    /// <paramref name="resigningPlayer"/> is the loser, the other seat wins, <see cref="Game.EndReason"/>
    /// is <c>"Resignation"</c>. Does not save or commit — the caller owns its own transaction.
    /// </summary>
    private async Task FinishByResignationAsync(Game game, Player resigningPlayer, DateTime now, CancellationToken ct) =>
        await FinishGameAsync(game, winner: Other(resigningPlayer), "Resignation", now, ct);

    /// <summary>
    /// Common tail behind both <see cref="FinishByTimeoutAsync"/> and
    /// <see cref="FinishByResignationAsync"/>: sets the win/<see cref="Game.EndReason"/>/
    /// <see cref="Game.FinishedAtUtc"/> fields and, when <see cref="Game.Rated"/>, applies Elo via
    /// the same <see cref="ApplyEloAsync"/> path every other decisive ending uses. Does not save or
    /// commit — the caller owns its own transaction.
    /// </summary>
    private async Task FinishGameAsync(Game game, Player winner, string endReason, DateTime now, CancellationToken ct)
    {
        var winnerStatus = winner == Player.P1 ? GameStatus.P1Win : GameStatus.P2Win;
        game.Status = winnerStatus;
        game.EndReason = endReason;
        game.FinishedAtUtc = now;

        if (game.Rated)
            await ApplyEloAsync(game, winnerStatus, ct);
    }

    /// <summary>
    /// Ends the game by resignation — <paramref name="seat"/> concedes, so the *other* seat wins.
    /// Same transaction shape as <see cref="ClaimTimeoutAsync"/>. Throws <see cref="ResignException"/>
    /// (→ 400) if <paramref name="seat"/> isn't "P1"/"P2" — a spectator has no seat to resign, and
    /// it's the only way the server knows who's conceding — or (→ 409, <see cref="ResignException.Conflict"/>)
    /// if the game isn't <see cref="GameStatus.InProgress"/>. Null if no game has this id.
    /// </summary>
    public async Task<ResignResponse?> ResignAsync(Guid id, string? seat, CancellationToken ct = default)
    {
        if (seat is not ("P1" or "P2"))
            throw new ResignException("spectators cannot resign");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return null;

        if (game.Status != GameStatus.InProgress)
            throw new ResignException("game is already finished", conflict: true);

        var now = Now();
        var resigningPlayer = Enum.Parse<Player>(seat);
        await FinishByResignationAsync(game, resigningPlayer, now, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return new ResignResponse(game.Id, game.Status.ToString(), game.EndReason!, now);
    }

    /// <summary>
    /// Loads both accounts (tracked, same context/transaction as the move) and applies
    /// <see cref="EloService.Apply"/> to whichever rating bucket matches
    /// <see cref="Game.TimeControl"/>'s <see cref="TimeControlCategory"/>. Only called when
    /// <see cref="Game.Rated"/> is true, which guarantees both <see cref="Game.P1UserId"/>/
    /// <see cref="Game.P2UserId"/> are set.
    ///
    /// Behavior change: an untimed rated game (<see cref="Game.TimeControl"/> null) has no category
    /// to attribute a rating change to, so this is a no-op — no bucket moves. Matches chess.com,
    /// which has no rating for "no time control" either.
    /// </summary>
    private async Task ApplyEloAsync(Game game, GameStatus status, CancellationToken ct)
    {
        if (game.TimeControl is null)
            return;
        var category = TimeControls.For(game.TimeControl).Category;

        var winnerId = status == GameStatus.P1Win ? game.P1UserId!.Value : game.P2UserId!.Value;
        var loserId = status == GameStatus.P1Win ? game.P2UserId!.Value : game.P1UserId!.Value;

        var winner = await db.Users.FirstAsync(u => u.Id == winnerId, ct);
        var loser = await db.Users.FirstAsync(u => u.Id == loserId, ct);

        var (winnerRatingBefore, winnerGamesPlayed) = winner.BucketFor(category);
        var (loserRatingBefore, loserGamesPlayed) = loser.BucketFor(category);

        var (winnerRating, loserRating) = EloService.Apply(winnerRatingBefore, loserRatingBefore);
        winner.SetBucket(category, winnerRating, winnerGamesPlayed + 1);
        loser.SetBucket(category, loserRating, loserGamesPlayed + 1);
    }
}
