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

    [Theory]
    [InlineData("Classic")]
    [InlineData("classic")]
    [InlineData("CLASSIC")]
    public void For_resolves_a_known_name_case_insensitively(string name)
    {
        Assert.Same(BoardLayouts.Classic, BoardLayouts.For(name));
    }

    [Fact]
    public void For_throws_a_named_exception_for_an_unknown_layout()
    {
        var ex = Assert.Throws<UnknownBoardLayoutException>(() => BoardLayouts.For("nonsense"));
        Assert.Equal("nonsense", ex.Name);
        Assert.Contains("nonsense", ex.Message);
    }
}
