using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Clock;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using static Khet.Api.Services.GameHelpers;

namespace Khet.Api.Services;

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
/// <see cref="Data.KhetDbContext"/> instance as <see cref="GameService"/> — that shared context is
/// what makes the single-transaction atomicity real. A future <c>AddSingleton</c> /
/// <c>AddTransient</c>-with-its-own-context registration would break that while every test stayed
/// green, so a DI-lifetime guard test asserts this stays Scoped. Do not change the lifetime.</para>
/// </summary>
public sealed class GameEndService(KhetDbContext db)
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
    /// <see cref="Game.TimeControl"/>'s <see cref="TimeControlCategory"/>. Called from
    /// <see cref="FinishGameAsync"/> and — for the Pharaoh win — directly from
    /// <see cref="GameService.SubmitMoveAsync"/>'s inline win branch. Only called when
    /// <see cref="Game.Rated"/> is true, which guarantees both <see cref="Game.P1UserId"/>/
    /// <see cref="Game.P2UserId"/> are set.
    ///
    /// Behavior change: an untimed rated game (<see cref="Game.TimeControl"/> null) has no category
    /// to attribute a rating change to, so this is a no-op — no bucket moves. Matches chess.com,
    /// which has no rating for "no time control" either.
    /// </summary>
    public async Task ApplyEloAsync(Game game, GameStatus status, CancellationToken ct)
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
