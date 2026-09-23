namespace Heliograph.Clock;

/// <summary>
/// Pure arithmetic for the server-authoritative chess clock — static, no DI/async, same
/// testability discipline as <c>Heliograph.Engine.GameEngine</c>. One mechanism serves both live
/// (Bullet/Blitz/Rapid) and Daily timeouts: a single <c>Heliograph.Api.Domain.Game.TurnDeadlineUtc</c> that
/// <see cref="HasExpired"/> compares against <c>now</c>. <c>Heliograph.Api.Services.GameService</c>-owned concerns
/// (which player is which, persistence, Elo) stay out of this type entirely — every method here
/// takes exactly the values it needs and returns a new value, nothing more.
/// </summary>
public static class ClockMath
{
    /// <summary>
    /// True once <paramref name="now"/> is strictly after <paramref name="deadline"/>. Null
    /// deadline (untimed game, or a game whose clock hasn't started yet) never expires — callers
    /// like <c>claim-timeout</c> rely on this returning false rather than throwing.
    /// </summary>
    public static bool HasExpired(DateTime? deadline, DateTime now) =>
        deadline is { } d && now > d;

    /// <summary>
    /// Result of <see cref="AfterMove"/>: the mover's new banked time, and the deadline the
    /// <em>next</em> mover now has to beat.
    /// </summary>
    public readonly record struct AfterMoveResult(long MoverRemainingMs, DateTime NextTurnStartedAtUtc, DateTime NextTurnDeadlineUtc);

    /// <summary>
    /// Applied once a live-category move is accepted. Elapsed time since <paramref name="turnStartedAtUtc"/>
    /// is subtracted from the mover's own banked <paramref name="moverRemainingMsBeforeMove"/>, clamped at
    /// zero (never negative — a move that arrives after expiry is rejected before this is ever called; see
    /// <c>Heliograph.Api.Services.GameService.SubmitMoveAsync</c>'s pre-validation expiry check), then <paramref name="control"/>'s
    /// increment is added. The next turn starts at <paramref name="now"/> and must be beaten before
    /// <paramref name="opponentRemainingMs"/> (the other player's own banked time, untouched by this
    /// call) elapses.
    /// </summary>
    public static AfterMoveResult AfterMove(
        TimeControl control,
        long moverRemainingMsBeforeMove,
        long opponentRemainingMs,
        DateTime turnStartedAtUtc,
        DateTime now)
    {
        var elapsedMs = (long)Math.Max(0, (now - turnStartedAtUtc).TotalMilliseconds);
        var remainingAfterElapsed = Math.Max(0L, moverRemainingMsBeforeMove - elapsedMs);
        var remainingAfterIncrement = remainingAfterElapsed + control.IncrementSeconds * 1000L;
        var nextTurnDeadlineUtc = now.AddMilliseconds(opponentRemainingMs);
        return new AfterMoveResult(remainingAfterIncrement, now, nextTurnDeadlineUtc);
    }

    /// <summary>
    /// Daily's whole mechanic: no banked-time balance, the deadline just resets to
    /// <paramref name="control"/>'s <see cref="TimeControl.DaysPerMove"/> after <paramref name="now"/>
    /// on every accepted move.
    /// </summary>
    public static DateTime NextDailyDeadline(TimeControl control, DateTime now) =>
        now.AddDays(control.DaysPerMove);
}
