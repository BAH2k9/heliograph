using Khet.Api.Domain;
using Khet.Api.Services;
using Khet.Engine.Enums;

namespace Khet.Api.Tests.Services;

/// <summary>
/// Pure unit tests for the clock lifecycle — literal <see cref="Game"/> + literal <c>now</c>, no
/// Postgres, no fixture (same discipline as <c>Khet.Clock.Tests</c>). The integration suite covers
/// the lifecycle end to end through HTTP; this file isolates the one behaviour it doesn't —
/// notably that the per-move increment is applied even on the very first move.
/// </summary>
public class GameClockLifecycleTests
{
    private static readonly DateTime Now = new(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);
    private readonly GameClockLifecycle _clock = new();

    [Fact]
    public void InitializeClock_is_a_no_op_for_an_untimed_game()
    {
        var game = new Game { TimeControl = null };

        _clock.InitializeClock(game, Now);

        Assert.Null(game.TurnStartedAtUtc);
        Assert.Null(game.TurnDeadlineUtc);
        Assert.Null(game.P1RemainingMs);
        Assert.Null(game.P2RemainingMs);
    }

    [Fact]
    public void InitializeClock_banks_the_starting_time_for_a_live_category()
    {
        var game = new Game { TimeControl = "5+0" }; // Blitz, 300s each, no increment

        _clock.InitializeClock(game, Now);

        Assert.Equal(300_000L, game.P1RemainingMs);
        Assert.Equal(300_000L, game.P2RemainingMs);
        Assert.Equal(Now, game.TurnStartedAtUtc);
        // Room games start with P1 to move, so the first deadline is P1's own full bank.
        Assert.Equal(Now.AddMilliseconds(300_000), game.TurnDeadlineUtc);
    }

    [Fact]
    public void InitializeClock_sets_only_a_deadline_for_a_daily_game()
    {
        var game = new Game { TimeControl = "3/move" };

        _clock.InitializeClock(game, Now);

        Assert.Equal(Now, game.TurnStartedAtUtc);
        Assert.Equal(Now.AddDays(3), game.TurnDeadlineUtc);
        Assert.Null(game.P1RemainingMs);
        Assert.Null(game.P2RemainingMs);
    }

    [Fact]
    public void UpdateClockAfterMove_subtracts_elapsed_and_adds_the_increment()
    {
        var game = new Game
        {
            TimeControl = "5+3", // 300s + 3s/move
            P1RemainingMs = 300_000,
            P2RemainingMs = 300_000,
        };
        var turnStarted = Now;
        var moveAccepted = Now.AddSeconds(10);

        _clock.UpdateClockAfterMove(game, Player.P1, turnStarted, moveAccepted);

        // 300_000 - 10_000 elapsed + 3_000 increment
        Assert.Equal(293_000L, game.P1RemainingMs);
        Assert.Equal(300_000L, game.P2RemainingMs); // opponent's bank untouched
        Assert.Equal(moveAccepted, game.TurnStartedAtUtc);
        Assert.Equal(moveAccepted.AddMilliseconds(300_000), game.TurnDeadlineUtc); // P2 gets their full bank
    }

    [Fact]
    public void UpdateClockAfterMove_applies_the_increment_even_on_the_first_move()
    {
        // The lifecycle has no "skip the increment on move 1" guard today — this asserts the
        // current behaviour so the "increment applied on the first move" change (should anyone
        // ever want it) has to update this file deliberately.
        var game = new Game
        {
            TimeControl = "5+3",
            MoveCount = 0,
            P1RemainingMs = 300_000,
            P2RemainingMs = 300_000,
        };

        _clock.UpdateClockAfterMove(game, Player.P1, Now, Now.AddSeconds(1));

        // 300_000 - 1_000 elapsed + 3_000 increment => a net gain on the opening move
        Assert.Equal(302_000L, game.P1RemainingMs);
    }

    [Fact]
    public void UpdateClockAfterMove_for_p2_touches_only_p2s_bank()
    {
        var game = new Game
        {
            TimeControl = "5+0",
            P1RemainingMs = 250_000,
            P2RemainingMs = 300_000,
        };

        _clock.UpdateClockAfterMove(game, Player.P2, Now, Now.AddSeconds(20));

        Assert.Equal(250_000L, game.P1RemainingMs); // untouched
        Assert.Equal(280_000L, game.P2RemainingMs); // 300_000 - 20_000, no increment
        Assert.Equal(Now.AddSeconds(20).AddMilliseconds(250_000), game.TurnDeadlineUtc); // off P1's bank
    }

    [Fact]
    public void UpdateClockAfterMove_only_resets_the_deadline_for_a_daily_game()
    {
        var game = new Game
        {
            TimeControl = "7/move",
            P1RemainingMs = null,
            P2RemainingMs = null,
        };
        var moveAccepted = Now.AddHours(30);

        _clock.UpdateClockAfterMove(game, Player.P1, Now, moveAccepted);

        Assert.Equal(moveAccepted, game.TurnStartedAtUtc);
        Assert.Equal(moveAccepted.AddDays(7), game.TurnDeadlineUtc);
        Assert.Null(game.P1RemainingMs);
        Assert.Null(game.P2RemainingMs);
    }

    [Fact]
    public void UpdateClockAfterMove_clamps_a_slow_move_at_zero_not_negative()
    {
        var game = new Game
        {
            TimeControl = "1+0", // 60s, no increment
            P1RemainingMs = 5_000,
            P2RemainingMs = 60_000,
        };

        // Move accepted 40s after the turn started but only 5s were banked — the pre-move expiry
        // check would normally have ended the game first; this guards the arithmetic regardless.
        _clock.UpdateClockAfterMove(game, Player.P1, Now, Now.AddSeconds(40));

        Assert.Equal(0L, game.P1RemainingMs);
    }

    [Fact]
    public void PreMoveExpiry_is_false_when_there_is_no_deadline()
    {
        var game = new Game { TurnDeadlineUtc = null };

        Assert.False(_clock.PreMoveExpiry(game, Now));
    }

    [Fact]
    public void PreMoveExpiry_is_false_before_the_deadline_and_true_strictly_after_it()
    {
        var game = new Game { TurnDeadlineUtc = Now };

        Assert.False(_clock.PreMoveExpiry(game, Now.AddMilliseconds(-1)));
        Assert.False(_clock.PreMoveExpiry(game, Now)); // exactly at the deadline is not yet expired
        Assert.True(_clock.PreMoveExpiry(game, Now.AddMilliseconds(1)));
    }
}
