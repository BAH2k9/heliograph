using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Clock;
using Heliograph.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using static Heliograph.Api.Services.GameHelpers;

namespace Heliograph.Api.Services;

/// <summary>
/// The game-ending core — the one place a game's <see cref="Game.Status"/> /
/// <see cref="Game.EndReason"/> / <see cref="Game.FinishedAtUtc"/> are set for a decisive result,
/// and the one place Elo is applied. Extracted from <see cref="GameService"/> so a task on "how a
/// game ends" or ratings opens this file; every ending except the Pharaoh win (which
/// <see cref="GameService.SubmitMoveAsync"/> sets inline, then calls <see cref="ApplyEloAsync"/>
/// here) routes through <see cref="FinishGameAsync"/>.
///
/// <para><b>Contract: never saves, never opens a transaction.</b> Each method mutates the tracked
/// <see cref="Game"/> (and, for Elo, two tracked <see cref="ApplicationUser"/> rows) and returns —
/// the calling <c>[TX]</c> entry point on <see cref="GameService"/> owns
/// <c>BeginTransactionAsync</c>, the single <c>SaveChangesAsync</c>, and <c>CommitAsync</c>.</para>
///
/// <para>Registered <c>AddScoped</c> so it resolves the <em>same</em> per-request
/// <see cref="Data.HeliographDbContext"/> instance as <see cref="GameService"/> — that shared context is
/// what makes the single-transaction atomicity real. A future <c>AddSingleton</c> /
/// <c>AddTransient</c>-with-its-own-context registration would break that while every test stayed
/// green, so a DI-lifetime guard test asserts this stays Scoped. Do not change the lifetime.</para>
/// </summary>
public sealed class GameEndService(HeliographDbContext db)
{
    /// <summary>
    /// Shared by <see cref="GameService.SubmitMoveAsync"/>'s pre-validation check and
    /// <see cref="GameService.ClaimTimeoutAsync"/>: ends the game exactly like an ordinary decisive
    /// win — reusing <see cref="GameStatus"/>'s existing <c>P1Win</c>/<c>P2Win</c> values and the
    /// same <see cref="ApplyEloAsync"/> trigger point — except <see cref="Game.EndReason"/> is
    /// <c>"Timeout"</c> rather than <c>"Pharaoh"</c>, and the mover who ran out is the loser.
    /// Does not save or commit — the caller owns its own transaction.
    /// </summary>
    public async Task FinishByTimeoutAsync(Game game, Player timedOutPlayer, DateTime now, CancellationToken ct) =>
        await FinishGameAsync(game, winner: Other(timedOutPlayer), "Timeout", now, ct);

    /// <summary>
    /// Shared by <see cref="GameService.ResignAsync"/>: same shape as
    /// <see cref="FinishByTimeoutAsync"/> — <paramref name="resigningPlayer"/> is the loser, the
    /// other seat wins, <see cref="Game.EndReason"/> is <c>"Resignation"</c>. Does not save or
    /// commit — the caller owns its own transaction.
    /// </summary>
    public async Task FinishByResignationAsync(Game game, Player resigningPlayer, DateTime now, CancellationToken ct) =>
        await FinishGameAsync(game, winner: Other(resigningPlayer), "Resignation", now, ct);

    /// <summary>
    /// Admin force-end (<c>POST /api/admin/games/{id}/force-end</c>): <paramref name="winner"/> is
    /// recorded as the winner and <see cref="Game.EndReason"/> is <c>"Aborted"</c>. Unlike every
    /// organic ending this deliberately does <b>not</b> touch Elo — an out-of-band admin
    /// intervention doesn't move ratings (owner decision), which is why it sets the fields directly
    /// instead of routing through <see cref="FinishGameAsync"/>. Does not save or commit — the
    /// caller owns its own transaction.
    /// </summary>
    public void FinishByAdmin(Game game, Player winner, DateTime now)
    {
        game.Status = winner == Player.P1 ? GameStatus.P1Win : GameStatus.P2Win;
        game.EndReason = "Aborted"; // 7 chars — fits the EndReason(16) column
        game.FinishedAtUtc = now;
    }

    /// <summary>
    /// Common tail behind both <see cref="FinishByTimeoutAsync"/> and
    /// <see cref="FinishByResignationAsync"/> (and called directly by
    /// <see cref="GameService.ClaimAbandonmentAsync"/>): sets the win/<see cref="Game.EndReason"/>/
    /// <see cref="Game.FinishedAtUtc"/> fields and, when <see cref="Game.Rated"/>, applies Elo via
    /// the same <see cref="ApplyEloAsync"/> path every other decisive ending uses. Does not save or
    /// commit — the caller owns its own transaction.
    /// </summary>
    public async Task FinishGameAsync(Game game, Player winner, string endReason, DateTime now, CancellationToken ct)
    {
        var winnerStatus = winner == Player.P1 ? GameStatus.P1Win : GameStatus.P2Win;
        game.Status = winnerStatus;
        game.EndReason = endReason;
        game.FinishedAtUtc = now;

        if (game.Rated)
            await ApplyEloAsync(game, winnerStatus, ct);
    }

    /// <summary>
    /// Loads both accounts (tracked, same context/transaction as the move) and applies
    /// <see cref="EloService.Apply"/> to whichever rating bucket matches
    /// <see cref="Game.TimeControl"/>'s <see cref="TimeControlCategory"/> —
    /// <see cref="TimeControlCategory.Untimed"/> when <see cref="Game.TimeControl"/> is null, owner
    /// decision (a rated untimed game still needs somewhere to attribute a rating change; matches
    /// the other four categories rather than being a no-op). Called from
    /// <see cref="FinishGameAsync"/> and — for the Pharaoh win — directly from
    /// <see cref="GameService.SubmitMoveAsync"/>'s inline win branch. Only called when
    /// <see cref="Game.Rated"/> is true, which guarantees both <see cref="Game.P1UserId"/>/
    /// <see cref="Game.P2UserId"/> are set.
    /// </summary>
    public async Task ApplyEloAsync(Game game, GameStatus status, CancellationToken ct)
    {
        var category = game.TimeControl is null ? TimeControlCategory.Untimed : TimeControls.For(game.TimeControl).Category;

        var winnerId = status == GameStatus.P1Win ? game.P1UserId!.Value : game.P2UserId!.Value;
        var loserId = status == GameStatus.P1Win ? game.P2UserId!.Value : game.P1UserId!.Value;

        var winner = await db.Users.FirstAsync(u => u.Id == winnerId, ct);
        var loser = await db.Users.FirstAsync(u => u.Id == loserId, ct);

        var (winnerRatingBefore, winnerGamesPlayed) = winner.BucketFor(category);
        var (loserRatingBefore, loserGamesPlayed) = loser.BucketFor(category);

        var (winnerRating, loserRating) = EloService.Apply(winnerRatingBefore, loserRatingBefore);
        winner.SetBucket(category, winnerRating, winnerGamesPlayed + 1);
        loser.SetBucket(category, loserRating, loserGamesPlayed + 1);

        winner.RecordResult(category, won: true);
        loser.RecordResult(category, won: false);
    }
}
