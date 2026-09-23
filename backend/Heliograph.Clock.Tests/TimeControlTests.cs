using Heliograph.Clock;

namespace Heliograph.Clock.Tests;

public class TimeControlTests
{
    [Theory]
    [InlineData("1+0", TimeControlCategory.Bullet, 60, 0, 0)]
    [InlineData("1+1", TimeControlCategory.Bullet, 60, 1, 0)]
    [InlineData("2+1", TimeControlCategory.Bullet, 120, 1, 0)]
    [InlineData("3+0", TimeControlCategory.Blitz, 180, 0, 0)]
    [InlineData("3+2", TimeControlCategory.Blitz, 180, 2, 0)]
    [InlineData("5+0", TimeControlCategory.Blitz, 300, 0, 0)]
    [InlineData("5+3", TimeControlCategory.Blitz, 300, 3, 0)]
    [InlineData("10+0", TimeControlCategory.Rapid, 600, 0, 0)]
    [InlineData("10+5", TimeControlCategory.Rapid, 600, 5, 0)]
    [InlineData("15+10", TimeControlCategory.Rapid, 900, 10, 0)]
    [InlineData("1/move", TimeControlCategory.Daily, 0, 0, 1)]
    [InlineData("3/move", TimeControlCategory.Daily, 0, 0, 3)]
    [InlineData("7/move", TimeControlCategory.Daily, 0, 0, 7)]
    public void Every_known_preset_has_the_documented_values(
        string name, TimeControlCategory category, int initialSeconds, int incrementSeconds, int daysPerMove)
    {
        var tc = TimeControls.For(name);
        Assert.Equal(name, tc.Name);
        Assert.Equal(category, tc.Category);
        Assert.Equal(initialSeconds, tc.InitialSeconds);
        Assert.Equal(incrementSeconds, tc.IncrementSeconds);
        Assert.Equal(daysPerMove, tc.DaysPerMove);
    }

    [Fact]
    public void Names_lists_exactly_the_thirteen_known_presets()
    {
        Assert.Equal(13, TimeControls.Names.Count);
        Assert.True(TimeControls.IsKnown("3+2"));
        Assert.False(TimeControls.IsKnown("bogus"));
    }

    [Theory]
    [InlineData("1/move")]
    [InlineData("1/MOVE")]
    [InlineData("1/Move")]
    public void For_resolves_a_known_name_case_insensitively(string name)
    {
        Assert.Same(TimeControls.Daily1, TimeControls.For(name));
    }

    [Fact]
    public void For_throws_a_named_exception_for_an_unknown_time_control()
    {
        var ex = Assert.Throws<UnknownTimeControlException>(() => TimeControls.For("bogus"));
        Assert.Equal("bogus", ex.Name);
        Assert.Contains("bogus", ex.Message);
    }
}
