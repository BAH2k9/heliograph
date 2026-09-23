using Heliograph.Api.Domain;
using Heliograph.Clock;
using Heliograph.Contracts;
using Heliograph.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using static Heliograph.Api.Services.GameHelpers;

namespace Heliograph.Api.Services;

// Claims + resign: the three [TX] entry points that share the CLAUDE.md "claim pattern" skeleton
// (load tracked Game -> guard -> now -> mutate -> one SaveChanges -> Commit) and all funnel into
// GameEndService, which sets the win fields / applies Elo but never saves. AbandonmentGraceSeconds
// lives here because the grace *check* is here — the disconnect *timestamps* it reads against are
// tracked in GameService.Disconnect.cs.
public sealed partial class GameService
{
    /// <summary>
    /// How long the *other* seat's connection must have been tracked as disconnected before
    /// <see cref="ClaimAbandonmentAsync"/> will accept a claim against it. A tunable constant, not
    /// a product negotiation (owner decision, backlog/02-disconnect-abandonment.md).
    /// </summary>
    private const int AbandonmentGraceSeconds = 45;

    /// <summary>
    /// Authoritatively resolves a claimed timeout against the server's own clock — never trusts
    /// the caller's own notion of "it's expired". Same one-mechanism-for-everything shape as
    /// <see cref="SubmitMoveAsync"/>'s pre-validation check: both funnel into
    /// <see cref="GameEndService.FinishByTimeoutAsync"/> so a timeout resolves identically whether
    /// it's caught by a submitted move or by this endpoint. Throws <see cref="ClaimTimeoutException"/>
    /// (→ 409) if the game isn't in progress, or if <see cref="Game.TurnDeadlineUtc"/> genuinely
    /// hasn't passed yet (including an untimed game, where it's always null). Null if no game has this id.
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

        await endService.FinishByTimeoutAsync(game, game.CurrentTurn, now, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        logger.LogInformation("timeout claimed: game {GameId} ended, {Status} ({EndReason})", game.Id, game.Status, game.EndReason);

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

        await endService.FinishGameAsync(game, winner: callerSeat, "Abandonment", now, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        logger.LogInformation("abandonment claimed: game {GameId} ended, {Status} ({EndReason})", game.Id, game.Status, game.EndReason);

        return new ClaimAbandonmentResponse(game.Id, game.Status.ToString(), game.EndReason!, now);
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
        await endService.FinishByResignationAsync(game, resigningPlayer, now, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        logger.LogInformation("resignation: game {GameId} ended, {Status} ({EndReason})", game.Id, game.Status, game.EndReason);

        return new ResignResponse(game.Id, game.Status.ToString(), game.EndReason!, now);
    }
}
