using System.Linq;
using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Api.Tests.Engine;

/// <summary>
/// The Khet 2.0 directional blocker: its front face — the direction its Orientation faces —
/// absorbs a laser hit and survives; a hit on any other face destroys it, exactly like a
/// pyramid struck on a blank face. It moves and rotates like a pyramid.
/// </summary>
public class AnubisTests
{
    private static PieceOnBoard Anubis(Player p, Orientation o) => new(Piece.Anubis, p, o, null);

    [Fact]
    public void A_beam_into_the_front_face_is_absorbed_and_the_anubis_survives()
    {
        var at = new Coord(4, 9);
        // Facing(SW) = Down; the beam travels Up column 9, entering through the Bottom edge — the front.
        var board = TestBoard.With((at, Anubis(Player.P2, Orientation.SW)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.Equal(LaserTermination.Absorbed, outcome.Termination);
        Assert.Equal(at, outcome.HitCell);
        Assert.Empty(outcome.Eliminated);
        Assert.NotNull(after.PieceAt(at));
        Assert.Equal(Piece.Anubis, after.PieceAt(at)!.Kind);
    }

    [Theory]
    [InlineData(Orientation.NE)] // back: front faces Up, the same direction the beam travels
    [InlineData(Orientation.NW)] // side: front faces Left
    [InlineData(Orientation.SE)] // side: front faces Right
    public void A_beam_into_any_other_face_destroys_the_anubis(Orientation facing)
    {
        var at = new Coord(4, 9);
        var board = TestBoard.With((at, Anubis(Player.P2, facing)));

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
        var board = TestBoard.With((at, Anubis(Player.P1, start)));

        var result = GameEngine.ValidateMove(board, EngineMove.Turn(at, dir), Player.P1);
        Assert.True(result.IsLegal);

        var next = GameEngine.ApplyMove(board, EngineMove.Turn(at, dir));
        Assert.Equal(expected, next.PieceAt(at)!.Orientation);
    }

    [Fact]
    public void An_anubis_moves_one_square_like_a_pyramid()
    {
        var from = new Coord(4, 4);
        var to = new Coord(4, 5);
        var board = TestBoard.With((from, Anubis(Player.P1, Orientation.NE)));

        Assert.True(GameEngine.ValidateMove(board, EngineMove.Shift(from, to), Player.P1).IsLegal);

        var next = GameEngine.ApplyMove(board, EngineMove.Shift(from, to));
        Assert.Null(next.PieceAt(from));
        Assert.Equal(Piece.Anubis, next.PieceAt(to)!.Kind);
    }

    [Fact]
    public void A_djed_may_swap_with_an_adjacent_anubis()
    {
        var djedAt = new Coord(4, 4);
        var anubisAt = new Coord(4, 5);
        var board = TestBoard.With(
            (djedAt, TestBoard.Djed(Orientation.NE, Player.P1)),
            (anubisAt, Anubis(Player.P2, Orientation.NW)));

        Assert.True(GameEngine.ValidateMove(board, EngineMove.Shift(djedAt, anubisAt), Player.P1).IsLegal);

        var next = GameEngine.ApplyMove(board, EngineMove.Shift(djedAt, anubisAt));
        Assert.Equal(Piece.Anubis, next.PieceAt(djedAt)!.Kind);
        Assert.Equal(Piece.Djed, next.PieceAt(anubisAt)!.Kind);
    }

    [Fact]
    public void Khet2Classic_layout_has_two_anubis_per_player_and_no_obelisk()
    {
        Assert.DoesNotContain(BoardLayouts.Khet2Classic.Pieces, p => p.Kind == Piece.Obelisk);

        var anubis = BoardLayouts.Khet2Classic.Pieces.Where(p => p.Kind == Piece.Anubis).ToList();
        Assert.Equal(4, anubis.Count);
        Assert.Equal(2, anubis.Count(p => p.Owner == Player.P1));
        Assert.Equal(2, anubis.Count(p => p.Owner == Player.P2));
        Assert.Equal(26, BoardLayouts.Khet2Classic.Pieces.Count); // 24 non-Sphinx + 2 Sphinx, unchanged
    }
}
