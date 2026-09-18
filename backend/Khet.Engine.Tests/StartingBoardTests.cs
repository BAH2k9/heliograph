using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Engine.Tests;

public class StartingBoardTests
{
    private static readonly Board Start = GameEngine.CreateStartingBoard();

    [Fact]
    public void Has_24_pieces_at_the_reference_positions()
    {
        var expected = new Dictionary<Coord, PieceOnBoard>
        {
            [new(3, 0)] = new(Piece.Pyramid, Player.P2, Orientation.NE, null),
            [new(4, 0)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(1, 2)] = new(Piece.Pyramid, Player.P2, Orientation.SW, null),
            [new(3, 2)] = new(Piece.Pyramid, Player.P1, Orientation.SW, null),
            [new(4, 2)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(7, 2)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(2, 3)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(7, 3)] = new(Piece.Obelisk, Player.P1, null, 2),
            [new(0, 4)] = new(Piece.Obelisk, Player.P2, null, 2),
            [new(3, 4)] = new(Piece.Djed, Player.P2, Orientation.NE, null),
            [new(4, 4)] = new(Piece.Djed, Player.P1, Orientation.NW, null),
            [new(7, 4)] = new(Piece.Pharaoh, Player.P1, null, null),
            [new(0, 5)] = new(Piece.Pharaoh, Player.P2, null, null),
            [new(3, 5)] = new(Piece.Djed, Player.P2, Orientation.NW, null),
            [new(4, 5)] = new(Piece.Djed, Player.P1, Orientation.NE, null),
            [new(7, 5)] = new(Piece.Obelisk, Player.P1, null, 2),
            [new(0, 6)] = new(Piece.Obelisk, Player.P2, null, 2),
            [new(5, 6)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(0, 7)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(3, 7)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(4, 7)] = new(Piece.Pyramid, Player.P2, Orientation.NE, null),
            [new(6, 7)] = new(Piece.Pyramid, Player.P1, Orientation.NE, null),
            [new(3, 9)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(4, 9)] = new(Piece.Pyramid, Player.P1, Orientation.SW, null),
        };

        Assert.Equal(expected.Count, Start.Pieces.Count);
        foreach (var (coord, piece) in expected)
        {
            Assert.True(Start.TryGet(coord, out var actual));
            Assert.Equal(piece, actual);
        }
    }

    [Theory]
    [InlineData(Player.P1)]
    [InlineData(Player.P2)]
    public void Each_player_has_7_pyramids_2_djed_2_obelisk_1_pharaoh(Player player)
    {
        var owned = Start.Pieces.Values.Where(p => p.Owner == player).ToList();

        Assert.Equal(12, owned.Count);
        Assert.Equal(7, owned.Count(p => p.Kind == Piece.Pyramid));
        Assert.Equal(2, owned.Count(p => p.Kind == Piece.Djed));
        Assert.Equal(2, owned.Count(p => p.Kind == Piece.Obelisk));
        Assert.Equal(1, owned.Count(p => p.Kind == Piece.Pharaoh));
    }

    [Fact]
    public void Pharaohs_start_at_7_4_for_P1_and_0_5_for_P2()
    {
        Assert.Equal(new PieceOnBoard(Piece.Pharaoh, Player.P1, null, null), Start.PieceAt(new Coord(7, 4)));
        Assert.Equal(new PieceOnBoard(Piece.Pharaoh, Player.P2, null, null), Start.PieceAt(new Coord(0, 5)));
    }

    [Fact]
    public void Every_starting_obelisk_has_health_2()
    {
        var obelisks = Start.Pieces.Values.Where(p => p.Kind == Piece.Obelisk).ToList();

        Assert.Equal(4, obelisks.Count);
        Assert.All(obelisks, o => Assert.Equal(2, o.Health));
    }

    [Theory]
    [InlineData(0, 9, Player.P1)]
    [InlineData(4, 9, Player.P1)]
    [InlineData(0, 1, Player.P1)]
    [InlineData(7, 1, Player.P1)]
    [InlineData(0, 0, Player.P2)]
    [InlineData(4, 0, Player.P2)]
    [InlineData(0, 8, Player.P2)]
    [InlineData(7, 8, Player.P2)]
    public void SquareOwner_marks_the_reference_restricted_squares(int row, int col, Player owner)
    {
        Assert.Equal(owner, GameEngine.SquareOwner(new Coord(row, col)));
    }

    [Theory]
    [InlineData(4, 4)]
    [InlineData(0, 2)]
    [InlineData(7, 7)]
    [InlineData(3, 1)]
    public void SquareOwner_is_null_for_neutral_squares(int row, int col)
    {
        Assert.Null(GameEngine.SquareOwner(new Coord(row, col)));
    }

    [Fact]
    public void Emitters_are_fixed_at_opposite_corners()
    {
        Assert.Equal((new Coord(7, 9), Direction.Up), GameEngine.EmitterFor(Player.P1));
        Assert.Equal((new Coord(0, 0), Direction.Down), GameEngine.EmitterFor(Player.P2));
    }
}
