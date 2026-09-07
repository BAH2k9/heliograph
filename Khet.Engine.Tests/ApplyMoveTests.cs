using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Api.Tests.Engine;

public class ApplyMoveTests
{
    [Fact]
    public void Moving_to_an_empty_square_leaves_the_source_empty_and_does_not_touch_the_original()
    {
        var from = new Coord(4, 4);
        var to = new Coord(4, 5);
        var piece = TestBoard.Pyramid(Orientation.NE, Player.P1);
        var board = TestBoard.With((from, piece));

        var next = GameEngine.ApplyMove(board, EngineMove.Shift(from, to));

        Assert.Null(next.PieceAt(from));
        Assert.Equal(piece, next.PieceAt(to));
        Assert.Equal(piece, board.PieceAt(from)); // original untouched
    }

    [Fact]
    public void A_djed_swap_exchanges_exactly_the_two_pieces()
    {
        var djedAt = new Coord(4, 4);
        var pyramidAt = new Coord(4, 5);
        var djed = TestBoard.Djed(Orientation.NE, Player.P1);
        var pyramid = TestBoard.Pyramid(Orientation.NW, Player.P2);
        var board = TestBoard.With((djedAt, djed), (pyramidAt, pyramid));

        var next = GameEngine.ApplyMove(board, EngineMove.Shift(djedAt, pyramidAt));

        Assert.Equal(pyramid, next.PieceAt(djedAt));
        Assert.Equal(djed, next.PieceAt(pyramidAt));
        Assert.Equal(2, next.Pieces.Count);
    }

    [Theory]
    [InlineData(Orientation.NW, RotationDir.CW, Orientation.NE)]
    [InlineData(Orientation.NE, RotationDir.CW, Orientation.SE)]
    [InlineData(Orientation.SE, RotationDir.CW, Orientation.SW)]
    [InlineData(Orientation.SW, RotationDir.CW, Orientation.NW)]
    [InlineData(Orientation.NW, RotationDir.CCW, Orientation.SW)]
    [InlineData(Orientation.SW, RotationDir.CCW, Orientation.SE)]
    [InlineData(Orientation.SE, RotationDir.CCW, Orientation.NE)]
    [InlineData(Orientation.NE, RotationDir.CCW, Orientation.NW)]
    public void Rotating_changes_only_the_orientation_of_the_piece(Orientation start, RotationDir dir, Orientation expected)
    {
        var at = new Coord(4, 4);
        var board = TestBoard.With((at, TestBoard.Pyramid(start, Player.P1)));

        var next = GameEngine.ApplyMove(board, EngineMove.Turn(at, dir));

        var rotated = next.PieceAt(at)!;
        Assert.Equal(expected, rotated.Orientation);
        Assert.Equal(Piece.Pyramid, rotated.Kind);
        Assert.Equal(Player.P1, rotated.Owner);
        Assert.Single(next.Pieces);
    }

    [Theory]
    [InlineData(RotationDir.CW)]
    [InlineData(RotationDir.CCW)]
    public void Four_rotations_return_a_piece_to_its_start(RotationDir dir)
    {
        var at = new Coord(4, 4);
        var board = TestBoard.With((at, TestBoard.Djed(Orientation.NE, Player.P1)));

        for (var i = 0; i < 4; i++)
            board = GameEngine.ApplyMove(board, EngineMove.Turn(at, dir));

        Assert.Equal(Orientation.NE, board.PieceAt(at)!.Orientation);
    }
}
