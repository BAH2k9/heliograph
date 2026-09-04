using Khet.Api.Domain.Enums;
using Khet.Api.Engine;

namespace Khet.Api.Tests.Engine;

public class BoardLayoutTests
{
    [Fact]
    public void Classic_layout_builds_the_historical_starting_board()
    {
        var fromLayout = BoardLayouts.Classic.Build();
        var reference = GameEngine.CreateStartingBoard();

        Assert.Equal(reference.Rows, fromLayout.Rows);
        Assert.Equal(reference.Cols, fromLayout.Cols);
        Assert.Equal(reference.Pieces.Count, fromLayout.Pieces.Count);
        foreach (var (coord, piece) in reference.Pieces)
        {
            Assert.True(fromLayout.TryGet(coord, out var actual));
            Assert.Equal(piece, actual);
        }
    }

    [Fact]
    public void Classic_layout_is_8x10_with_24_pieces()
    {
        Assert.Equal(8, BoardLayouts.Classic.Rows);
        Assert.Equal(10, BoardLayouts.Classic.Cols);
        Assert.Equal(24, BoardLayouts.Classic.Pieces.Count);
    }

    [Theory]
    [InlineData(Player.P1)]
    [InlineData(Player.P2)]
    public void Each_player_gets_the_standard_piece_counts(Player player)
    {
        var owned = BoardLayouts.Classic.Pieces.Where(p => p.Owner == player).ToList();

        Assert.Equal(12, owned.Count);
        Assert.Equal(7, owned.Count(p => p.Kind == Piece.Pyramid));
        Assert.Equal(2, owned.Count(p => p.Kind == Piece.Djed));
        Assert.Equal(2, owned.Count(p => p.Kind == Piece.Obelisk));
        Assert.Equal(1, owned.Count(p => p.Kind == Piece.Pharaoh));
    }

    [Fact]
    public void Every_obelisk_starts_two_high()
    {
        Assert.All(
            BoardLayouts.Classic.Pieces.Where(p => p.Kind == Piece.Obelisk),
            o => Assert.Equal(2, o.Health));
    }

    [Fact]
    public void Imhotep_layout_has_24_pieces_at_the_reference_positions()
    {
        var expected = new Dictionary<Coord, PieceOnBoard>
        {
            [new(0, 4)] = new(Piece.Obelisk, Player.P2, null, 2),
            [new(0, 5)] = new(Piece.Pharaoh, Player.P2, null, null),
            [new(0, 6)] = new(Piece.Obelisk, Player.P2, null, 2),
            [new(0, 7)] = new(Piece.Djed, Player.P2, Orientation.NE, null),
            [new(2, 3)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(2, 6)] = new(Piece.Pyramid, Player.P2, Orientation.NE, null),
            [new(3, 0)] = new(Piece.Pyramid, Player.P2, Orientation.NE, null),
            [new(3, 1)] = new(Piece.Pyramid, Player.P1, Orientation.NE, null),
            [new(3, 4)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(3, 5)] = new(Piece.Djed, Player.P2, Orientation.NW, null),
            [new(3, 8)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(3, 9)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(4, 0)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(4, 1)] = new(Piece.Pyramid, Player.P1, Orientation.NE, null),
            [new(4, 4)] = new(Piece.Djed, Player.P1, Orientation.NW, null),
            [new(4, 5)] = new(Piece.Pyramid, Player.P2, Orientation.NW, null),
            [new(4, 8)] = new(Piece.Pyramid, Player.P2, Orientation.NE, null),
            [new(4, 9)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(5, 3)] = new(Piece.Pyramid, Player.P1, Orientation.NE, null),
            [new(5, 6)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(7, 2)] = new(Piece.Djed, Player.P1, Orientation.NW, null),
            [new(7, 3)] = new(Piece.Obelisk, Player.P1, null, 2),
            [new(7, 4)] = new(Piece.Pharaoh, Player.P1, null, null),
            [new(7, 5)] = new(Piece.Obelisk, Player.P1, null, 2),
        };

        var board = BoardLayouts.Imhotep.Build();
        Assert.Equal(expected.Count, board.Pieces.Count);
        foreach (var (coord, piece) in expected)
        {
            Assert.True(board.TryGet(coord, out var actual));
            Assert.Equal(piece, actual);
        }
    }

    [Fact]
    public void Dynasty_layout_has_24_pieces_at_the_reference_positions()
    {
        var expected = new Dictionary<Coord, PieceOnBoard>
        {
            [new(0, 4)] = new(Piece.Pyramid, Player.P2, Orientation.NE, null),
            [new(0, 5)] = new(Piece.Obelisk, Player.P2, null, 2),
            [new(0, 6)] = new(Piece.Pyramid, Player.P2, Orientation.SW, null),
            [new(1, 5)] = new(Piece.Pharaoh, Player.P2, null, null),
            [new(2, 0)] = new(Piece.Pyramid, Player.P2, Orientation.NE, null),
            [new(2, 4)] = new(Piece.Pyramid, Player.P2, Orientation.NE, null),
            [new(2, 5)] = new(Piece.Obelisk, Player.P2, null, 2),
            [new(2, 6)] = new(Piece.Djed, Player.P2, Orientation.NE, null),
            [new(3, 0)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(3, 2)] = new(Piece.Djed, Player.P2, Orientation.NW, null),
            [new(3, 4)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(3, 6)] = new(Piece.Pyramid, Player.P1, Orientation.SE, null),
            [new(4, 3)] = new(Piece.Pyramid, Player.P2, Orientation.NW, null),
            [new(4, 5)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(4, 7)] = new(Piece.Djed, Player.P1, Orientation.NE, null),
            [new(4, 9)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(5, 3)] = new(Piece.Djed, Player.P1, Orientation.NW, null),
            [new(5, 4)] = new(Piece.Obelisk, Player.P1, null, 2),
            [new(5, 5)] = new(Piece.Pyramid, Player.P1, Orientation.NE, null),
            [new(5, 9)] = new(Piece.Pyramid, Player.P1, Orientation.SW, null),
            [new(6, 4)] = new(Piece.Pharaoh, Player.P1, null, null),
            [new(7, 3)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(7, 4)] = new(Piece.Obelisk, Player.P1, null, 2),
            [new(7, 5)] = new(Piece.Pyramid, Player.P1, Orientation.NE, null),
        };

        var board = BoardLayouts.Dynasty.Build();
        Assert.Equal(expected.Count, board.Pieces.Count);
        foreach (var (coord, piece) in expected)
        {
            Assert.True(board.TryGet(coord, out var actual));
            Assert.Equal(piece, actual);
        }
    }

    [Theory]
    [InlineData("Imhotep")]
    [InlineData("Dynasty")]
    public void Alt_layouts_have_the_standard_piece_counts_per_side(string name)
    {
        var layout = BoardLayouts.For(name);

        Assert.Equal(8, layout.Rows);
        Assert.Equal(10, layout.Cols);
        Assert.Equal(24, layout.Pieces.Count);
        foreach (var player in new[] { Player.P1, Player.P2 })
        {
            var owned = layout.Pieces.Where(p => p.Owner == player).ToList();
            Assert.Equal(12, owned.Count);
            Assert.Equal(7, owned.Count(p => p.Kind == Piece.Pyramid));
            Assert.Equal(2, owned.Count(p => p.Kind == Piece.Djed));
            Assert.Equal(2, owned.Count(p => p.Kind == Piece.Obelisk));
            Assert.Equal(1, owned.Count(p => p.Kind == Piece.Pharaoh));
        }
    }

    [Theory]
    [InlineData("Classic")]
    [InlineData("classic")]
    [InlineData("CLASSIC")]
    public void For_resolves_a_known_name_case_insensitively(string name)
    {
        Assert.Same(BoardLayouts.Classic, BoardLayouts.For(name));
    }

    [Theory]
    [InlineData("Imhotep")]
    [InlineData("imhotep")]
    [InlineData("Dynasty")]
    [InlineData("DYNASTY")]
    public void For_resolves_the_alt_layouts_case_insensitively(string name)
    {
        var expected = name.Equals("Imhotep", StringComparison.OrdinalIgnoreCase) ? BoardLayouts.Imhotep : BoardLayouts.Dynasty;
        Assert.Same(expected, BoardLayouts.For(name));
    }

    [Fact]
    public void For_throws_a_named_exception_for_an_unknown_layout()
    {
        var ex = Assert.Throws<UnknownBoardLayoutException>(() => BoardLayouts.For("nonsense"));
        Assert.Equal("nonsense", ex.Name);
        Assert.Contains("nonsense", ex.Message);
    }
}
