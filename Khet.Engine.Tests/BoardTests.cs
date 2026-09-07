using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Engine.Tests;

public class BoardTests
{
    private static readonly Coord A = new(2, 3);
    private static readonly Coord B = new(2, 4);

    [Fact]
    public void With_returns_a_new_board_and_leaves_the_original_untouched()
    {
        var original = TestBoard.Empty();
        var piece = TestBoard.Pyramid(Orientation.NE);

        var next = original.With(A, piece);

        Assert.False(original.TryGet(A, out _));
        Assert.True(next.TryGet(A, out var placed));
        Assert.Equal(piece, placed);
        Assert.NotSame(original, next);
    }

    [Fact]
    public void Without_removes_only_the_named_square()
    {
        var board = TestBoard.With((A, TestBoard.Pyramid(Orientation.NE)), (B, TestBoard.Djed(Orientation.NW)));

        var next = board.Without(A);

        Assert.False(next.TryGet(A, out _));
        Assert.True(next.TryGet(B, out _));
        Assert.True(board.TryGet(A, out _)); // original unchanged
    }

    [Fact]
    public void Swap_exchanges_the_two_pieces()
    {
        var pyramid = TestBoard.Pyramid(Orientation.NE, Player.P1);
        var djed = TestBoard.Djed(Orientation.NW, Player.P2);
        var board = TestBoard.With((A, pyramid), (B, djed));

        var next = board.Swap(A, B);

        Assert.Equal(djed, next.PieceAt(A));
        Assert.Equal(pyramid, next.PieceAt(B));
        Assert.Equal(pyramid, board.PieceAt(A)); // original unchanged
    }

    [Theory]
    [InlineData(-1, 0, false)]
    [InlineData(0, -1, false)]
    [InlineData(0, 0, true)]
    [InlineData(7, 9, true)]
    [InlineData(8, 9, false)]
    [InlineData(7, 10, false)]
    public void InBounds_matches_the_8x10_grid(int row, int col, bool expected)
    {
        Assert.Equal(expected, TestBoard.Empty().InBounds(new Coord(row, col)));
    }
}
