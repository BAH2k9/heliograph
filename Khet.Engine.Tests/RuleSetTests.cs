using Khet.Engine;

namespace Khet.Api.Tests.Engine;

public class RuleSetTests
{
    [Fact]
    public void Classic_is_a_fixed_laser_with_stacking_obelisks()
    {
        Assert.Equal("Classic", RuleSets.Classic.Name);
        Assert.False(RuleSets.Classic.RotatingSphinx);
        Assert.True(RuleSets.Classic.StackableObelisks);
    }

    [Theory]
    [InlineData("Classic")]
    [InlineData("classic")]
    [InlineData("CLASSIC")]
    public void For_resolves_a_known_name_case_insensitively(string name)
    {
        Assert.Same(RuleSets.Classic, RuleSets.For(name));
    }

    [Fact]
    public void For_throws_a_named_exception_for_an_unknown_ruleset()
    {
        var ex = Assert.Throws<UnknownRuleSetException>(() => RuleSets.For("bogus"));
        Assert.Equal("bogus", ex.Name);
        Assert.Contains("bogus", ex.Message);
    }
}
