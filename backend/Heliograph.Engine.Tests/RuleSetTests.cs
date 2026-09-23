using Heliograph.Engine;

namespace Heliograph.Engine.Tests;

public class RuleSetTests
{
    [Fact]
    public void FixedSun_is_a_fixed_laser_with_stacking_bastions()
    {
        Assert.Equal("FixedSun", RuleSets.FixedSun.Name);
        Assert.False(RuleSets.FixedSun.RotatingHeliostat);
        Assert.True(RuleSets.FixedSun.StackableBastions);
    }

    [Theory]
    [InlineData("FixedSun")]
    [InlineData("fixedsun")]
    [InlineData("FIXEDSUN")]
    public void For_resolves_a_known_name_case_insensitively(string name)
    {
        Assert.Same(RuleSets.FixedSun, RuleSets.For(name));
    }

    [Fact]
    public void For_throws_a_named_exception_for_an_unknown_ruleset()
    {
        var ex = Assert.Throws<UnknownRuleSetException>(() => RuleSets.For("bogus"));
        Assert.Equal("bogus", ex.Name);
        Assert.Contains("bogus", ex.Message);
    }
}
