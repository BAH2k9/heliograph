using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Engine.Tests;

/// <summary>
/// The Turning Sun directional blocker: its front face — the direction its Orientation faces —
/// absorbs a laser hit and survives; a hit on any other face destroys it, exactly like a
/// mirror struck on a blank face. It moves and rotates like a mirror.
/// </summary>
public class SentinelTests
{
    private static PieceOnBoard Sentinel(Player p, Orientation o) => new(Piece.Sentinel, p, o, null);

    [Fact]
    public void A_beam_into_the_front_face_is_absorbed_and_the_sentinel_survives()
    {
        var at = new Coord(4, 9);
        // Facing(SW) = Down; the beam travels Up column 9, entering through the Bottom edge — the front.
        var board = TestBoard.With((at, Sentinel(Player.P2, Orientation.SW)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.Equal(LaserTermination.Absorbed, outcome.Termination);
        Assert.Equal(at, outcome.HitCell);
        Assert.Empty(outcome.Eliminated);
        Assert.NotNull(after.PieceAt(at));
        Assert.Equal(Piece.Sentinel, after.PieceAt(at)!.Kind);
    }

    [Theory]
    [InlineData(Orientation.NE)] // back: front faces Up, the same direction the beam travels
    [InlineData(Orientation.NW)] // side: front faces Left
    [InlineData(Orientation.SE)] // side: front faces Right
    public void A_beam_into_any_other_face_destroys_the_sentinel(Orientation facing)
    {
        var at = new Coord(4, 9);
        var board = TestBoard.With((at, Sentinel(Player.P2, facing)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.Equal(LaserTermination.Absorbed, outcome.Termination);
        Assert.Contains(at, outcome.Eliminated);
        Assert.Null(after.PieceAt(at));
    }

    [Theory]
    [InlineData(Orientation.NW, RotationDir.CW, Orientation.NE)]
    [InlineData(Orientation.NE, RotationDir.CW, Orientation.SE)]
    [InlineData(Orientation.SE, RotationDir.CW, Orientation.SW)]
    [InlineData(Orientation.SW, RotationDir.CW, Orientation.NW)]
    [InlineData(Orientation.NW, RotationDir.CCW, Orientation.SW)]
    public void Rotating_cycles_through_all_four_facings(Orientation start, RotationDir dir, Orientation expected)
    {
        var at = new Coord(4, 4);
        var board = TestBoard.With((at, Sentinel(Player.P1, start)));

        var result = GameEngine.ValidateMove(board, EngineMove.Turn(at, dir), Player.P1);
        Assert.True(result.IsLegal);

        var next = GameEngine.ApplyMove(board, EngineMove.Turn(at, dir));
        Assert.Equal(expected, next.PieceAt(at)!.Orientation);
    }

    [Fact]
    public void An_sentinel_moves_one_square_like_a_mirror()
    {
        var from = new Coord(4, 4);
        var to = new Coord(4, 5);
        var board = TestBoard.With((from, Sentinel(Player.P1, Orientation.NE)));

        Assert.True(GameEngine.ValidateMove(board, EngineMove.Shift(from, to), Player.P1).IsLegal);

        var next = GameEngine.ApplyMove(board, EngineMove.Shift(from, to));
        Assert.Null(next.PieceAt(from));
        Assert.Equal(Piece.Sentinel, next.PieceAt(to)!.Kind);
    }

    [Fact]
    public void A_swivel_may_swap_with_an_adjacent_sentinel()
    {
        var swivelAt = new Coord(4, 4);
        var sentinelAt = new Coord(4, 5);
        var board = TestBoard.With(
            (swivelAt, TestBoard.Swivel(Orientation.NE, Player.P1)),
            (sentinelAt, Sentinel(Player.P2, Orientation.NW)));

        Assert.True(GameEngine.ValidateMove(board, EngineMove.Shift(swivelAt, sentinelAt), Player.P1).IsLegal);

        var next = GameEngine.ApplyMove(board, EngineMove.Shift(swivelAt, sentinelAt));
        Assert.Equal(Piece.Sentinel, next.PieceAt(swivelAt)!.Kind);
        Assert.Equal(Piece.Swivel, next.PieceAt(sentinelAt)!.Kind);
    }

    [Theory]
    [InlineData("Dawn")]
    [InlineData("Zenith")]
    [InlineData("Dusk")]
    public void Rotating_emitter_layout_has_two_sentinel_per_player_and_no_bastion(string name)
    {
        var layout = BoardLayouts.For(name, RuleSets.TurningSun);
        Assert.DoesNotContain(layout.Pieces, p => p.Kind == Piece.Bastion);

        var sentinel = layout.Pieces.Where(p => p.Kind == Piece.Sentinel).ToList();
        Assert.Equal(4, sentinel.Count);
        Assert.Equal(2, sentinel.Count(p => p.Owner == Player.P1));
        Assert.Equal(2, sentinel.Count(p => p.Owner == Player.P2));
        Assert.Equal(26, layout.Pieces.Count); // 24 non-Heliostat + 2 Heliostat
    }
}
