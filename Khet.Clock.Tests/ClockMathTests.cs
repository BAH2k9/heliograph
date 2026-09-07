using Khet.Clock;

namespace Khet.Clock.Tests;

/// <summary>
/// Pure arithmetic tests with literal <see cref="DateTime"/>s — no flake risk, most of the clock's
/// coverage belongs here (see the plan's testing-approach section).
/// </summary>
public class ClockMathTests
{
    private static readonly DateTime Epoch = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void HasExpired_is_false_for_a_null_deadline()
    {
        Assert.False(ClockMath.HasExpired(null, Epoch));
    }

    [Fact]
    public void HasExpired_is_false_exactly_at_the_deadline()
    {
        Assert.False(ClockMath.HasExpired(Epoch, Epoch));
    }

    [Fact]
    public void HasExpired_is_false_one_tick_before_the_deadline()
    {
        Assert.False(ClockMath.HasExpired(Epoch, Epoch.AddTicks(-1)));
    }

    [Fact]
    public void HasExpired_is_true_one_tick_after_the_deadline()
    {
        Assert.True(ClockMath.HasExpired(Epoch, Epoch.AddTicks(1)));
    }

    [Fact]
    public void AfterMove_subtracts_elapsed_time_from_the_movers_bank()
    {
        var turnStarted = Epoch;
        var now = Epoch.AddSeconds(7);
        var result = ClockMath.AfterMove(TimeControls.Bullet1_0, moverRemainingMsBeforeMove: 60_000,
            opponentRemainingMs: 60_000, turnStarted, now);

        // 60s - 7s elapsed + 0 increment = 53s.
        Assert.Equal(53_000, result.MoverRemainingMs);
    }

    [Fact]
    public void AfterMove_adds_the_increment_after_subtracting_elapsed_time()
    {
        var turnStarted = Epoch;
        var now = Epoch.AddSeconds(10);
        var result = ClockMath.AfterMove(TimeControls.Blitz3_2, moverRemainingMsBeforeMove: 180_000,
            opponentRemainingMs: 180_000, turnStarted, now);

        // 180s - 10s elapsed + 2s increment = 172s.
        Assert.Equal(172_000, result.MoverRemainingMs);
    }

    [Fact]
    public void AfterMove_clamps_the_movers_remaining_time_at_zero_before_adding_increment()
    {
        var turnStarted = Epoch;
        var now = Epoch.AddSeconds(90); // more than the 60s bank

        var result = ClockMath.AfterMove(TimeControls.Bullet1_1, moverRemainingMsBeforeMove: 60_000,
            opponentRemainingMs: 60_000, turnStarted, now);

        // Elapsed exceeds remaining -> clamp to 0, then +1s increment = 1s. Never negative.
        Assert.Equal(1_000, result.MoverRemainingMs);
    }

    [Fact]
    public void AfterMove_sets_the_next_turn_to_start_now_and_deadline_off_the_opponents_own_bank()
    {
        var turnStarted = Epoch;
        var now = Epoch.AddSeconds(5);

        var result = ClockMath.AfterMove(TimeControls.Rapid10_0, moverRemainingMsBeforeMove: 600_000,
            opponentRemainingMs: 45_000, turnStarted, now);

        Assert.Equal(now, result.NextTurnStartedAtUtc);
        Assert.Equal(now.AddMilliseconds(45_000), result.NextTurnDeadlineUtc);
    }

    [Fact]
    public void NextDailyDeadline_adds_days_per_move_to_now()
    {
        var now = Epoch;

        var deadline = ClockMath.NextDailyDeadline(TimeControls.Daily3, now);

        Assert.Equal(now.AddDays(3), deadline);
    }

    [Fact]
    public void NextDailyDeadline_ignores_any_banked_time_concept_entirely()
    {
        // Daily has InitialSeconds/IncrementSeconds == 0; the deadline only ever depends on
        // DaysPerMove and now, matching TimeControl.DaysPerMove's doc comment.
        var now = new DateTime(2026, 6, 15, 13, 45, 0, DateTimeKind.Utc);

        var deadline = ClockMath.NextDailyDeadline(TimeControls.Daily1, now);

        Assert.Equal(new DateTime(2026, 6, 16, 13, 45, 0, DateTimeKind.Utc), deadline);
    }
}
