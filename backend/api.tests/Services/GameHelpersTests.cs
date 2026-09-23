using Heliograph.Api.Mapping;
using Heliograph.Api.Services;
using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Api.Tests.Services;

/// <summary>
/// Pure unit tests of the name resolution and board building behind every game-creation path —
/// no DB, no HTTP.
/// </summary>
public class GameHelpersTests
{
    private static readonly DateTime Now = new(2026, 9, 23, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Resolve_defaults_a_blank_layout_to_Dawn_and_canonicalises_casing()
    {
        Assert.Equal("Dawn", GameHelpers.Resolve(null, null).Layout);
        Assert.Equal("Dawn", GameHelpers.Resolve(null, "  ").Layout);
        Assert.Equal("Zenith", GameHelpers.Resolve(null, " zenith ").Layout);
    }

    [Fact]
    public void Resolve_rejects_an_unknown_layout_name()
    {
        Assert.Throws<UnknownBoardLayoutException>(() => GameHelpers.Resolve(null, "RetiredLayout"));
    }

    [Theory]
    [InlineData("FixedSun", 24)]
    [InlineData("TurningSun", 26)]
    public void NewGame_builds_the_layout_for_its_ruleset(string ruleset, int pieces)
    {
        var game = GameHelpers.NewGame(ruleset, "Dusk", Now);

        Assert.Equal("Dusk", game.Layout);
        Assert.Equal(pieces, game.State.Pieces.Count);
        var expected = BoardMapper.ToState(BoardLayouts.For("Dusk", RuleSets.For(ruleset)).Build());
        Assert.Equal(expected.Pieces, game.State.Pieces);
    }

    // A rematch or a stale invite carries the stored layout name straight into NewGame, bypassing
    // Resolve. A name retired since the row was written must fall back to the default, not throw.
    [Fact]
    public void NewGame_falls_back_to_the_default_setup_for_a_retired_layout_name()
    {
        var game = GameHelpers.NewGame("FixedSun", "RetiredLayout", Now, Player.P2);

        Assert.Equal(BoardLayouts.DefaultName, game.Layout);
        Assert.Equal(BoardMapper.ToState(BoardLayouts.Dawn.Build()).Pieces, game.State.Pieces);
        Assert.Equal(Player.P2, game.CurrentTurn);
    }
}
