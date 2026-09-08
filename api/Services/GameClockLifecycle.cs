using Khet.Api.Domain;
using Khet.Clock;
using Khet.Engine.Enums;

namespace Khet.Api.Services;

/// <summary>
/// The clock <em>lifecycle</em> — deciding <em>when</em> <see cref="ClockMath"/>'s pure arithmetic
/// is applied to a <see cref="Game"/>'s clock fields (start the clock, bank a mover's time, reset a
/// Daily deadline, test pre-move expiry). Pure <see cref="Game"/>-field mutation: no
/// <c>DbContext</c>, no transaction, and — like <see cref="ClockMath"/> itself — no wall-clock read.
/// Every method takes <c>now</c> as a parameter so one captured instant drives an entire move (see
/// <see cref="GameService.SubmitMoveAsync"/>, which documents why a second instant would be a
/// timing-semantics change).
///
/// Registered <c>AddScoped</c> alongside <see cref="GameService"/> — it holds no state, but the
/// hybrid decomposition keeps collaborators as injected instances rather than statics. Do not
/// change that lifetime.
/// </summary>
public sealed class GameClockLifecycle
{
    /// <summary>
    /// True when <paramref name="game"/>'s current turn deadline has already passed at
    /// <paramref name="now"/> — the check <see cref="GameService.SubmitMoveAsync"/> runs <em>before</em>
    /// it will validate a move, so a mover who is already out of time can never sneak one in, and
    /// the check <see cref="GameService.ClaimTimeoutAsync"/> mirrors. Thin pass-through to
    /// <see cref="ClockMath.HasExpired"/>: a null deadline (untimed, or a timed room whose clock
    /// hasn't started) is never expired.
    /// </summary>
    public bool PreMoveExpiry(Game game, DateTime now) => ClockMath.HasExpired(game.TurnDeadlineUtc, now);

    /// <summary>
    /// Starts the clock the instant both seats are filled (see <see cref="RoomService.JoinRoomAsync"/>'s
    /// doc comment for why not at room creation). No-op for an untimed room
    /// (<see cref="Game.TimeControl"/> null). Room games always start with P1 to move
    /// (<c>GameHelpers.NewGame</c>'s default), so the live-category deadline is P1's own bank; Daily
    /// has no bank at all — see <see cref="ClockMath.NextDailyDeadline"/>.
    /// </summary>
    public void InitializeClock(Game game, DateTime now)
    {
        if (game.TimeControl is null)
            return;

        var control = TimeControls.For(game.TimeControl);
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
    /// <see cref="GameService.SubmitMoveAsync"/>'s call site). Daily just resets its deadline —
    /// <see cref="ClockMath.NextDailyDeadline"/>; a live category banks <paramref name="mover"/>'s
    /// remaining time and sets the next turn's start/deadline off the <em>other</em> player's own
    /// bank, which this move never touches — <see cref="ClockMath.AfterMove"/>.
    /// </summary>
    public void UpdateClockAfterMove(Game game, Player mover, DateTime turnStartedAtUtc, DateTime now)
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
