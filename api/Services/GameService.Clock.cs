using Khet.Api.Domain;
using Khet.Clock;
using Khet.Engine.Enums;

namespace Khet.Api.Services;

// Clock lifecycle: pure Game-field mutation, no DbContext. InitializeClock is called from
// JoinRoomAsync when both seats fill; UpdateClockAfterMove from SubmitMoveAsync after an accepted
// move. The actual arithmetic lives in Khet.Clock.ClockMath — these just decide when to apply it.
public sealed partial class GameService
{
    /// <summary>
    /// Starts the clock the instant both seats are filled (see <see cref="JoinRoomAsync"/>'s doc
    /// comment for why not at room creation). No-op for an untimed room (<see cref="Game.TimeControl"/>
    /// null). Room games always start with P1 to move (<see cref="NewGame"/>'s default), so the
    /// live-category deadline is P1's own bank; Daily has no bank at all — see
    /// <see cref="ClockMath.NextDailyDeadline"/>.
    /// </summary>
    private void InitializeClock(Game game)
    {
        if (game.TimeControl is null)
            return;

        var control = TimeControls.For(game.TimeControl);
        var now = Now();
        game.TurnStartedAtUtc = now;

        if (control.Category == TimeControlCategory.Daily)
        {
            game.TurnDeadlineUtc = ClockMath.NextDailyDeadline(control, now);
            return;
        }

        var initialMs = control.InitialSeconds * 1000L;
        game.P1RemainingMs = initialMs;
        game.P2RemainingMs = initialMs;
        game.TurnDeadlineUtc = now.AddMilliseconds(initialMs);
    }

    /// <summary>
    /// Applied after an accepted move on a game whose clock has actually started (see
    /// <see cref="SubmitMoveAsync"/>'s call site). Daily just resets its deadline —
    /// <see cref="ClockMath.NextDailyDeadline"/>; a live category banks <paramref name="mover"/>'s
    /// remaining time and sets the next turn's start/deadline off the *other* player's own bank,
    /// which this move never touches — <see cref="ClockMath.AfterMove"/>.
    /// </summary>
    private void UpdateClockAfterMove(Game game, Player mover, DateTime turnStartedAtUtc, DateTime now)
    {
        var control = TimeControls.For(game.TimeControl!);

        if (control.Category == TimeControlCategory.Daily)
        {
            game.TurnStartedAtUtc = now;
            game.TurnDeadlineUtc = ClockMath.NextDailyDeadline(control, now);
            return;
        }

        var moverRemainingMs = mover == Player.P1 ? game.P1RemainingMs : game.P2RemainingMs;
        var opponentRemainingMs = mover == Player.P1 ? game.P2RemainingMs : game.P1RemainingMs;
        var result = ClockMath.AfterMove(control, moverRemainingMs ?? 0, opponentRemainingMs ?? 0, turnStartedAtUtc, now);

        if (mover == Player.P1)
            game.P1RemainingMs = result.MoverRemainingMs;
        else
            game.P2RemainingMs = result.MoverRemainingMs;
        game.TurnStartedAtUtc = result.NextTurnStartedAtUtc;
        game.TurnDeadlineUtc = result.NextTurnDeadlineUtc;
    }
}
