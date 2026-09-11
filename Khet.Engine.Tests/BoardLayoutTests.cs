using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Engine.Tests;

public class BoardLayoutTests
{
    // Orientation-blind guard: coordinate/count tests pass even if a layout's pyramid/djed
    // facings use a different mirror convention than this engine's — the same failure shape
    // as the LaserReflection entry-side gotcha (see LaserReflectionFrameTests). If either
    // player's opening move destroys one of their own pieces, the layout is unplayable as
    // transcribed. Classic is the control — it's the one actually deployed and played.
    [Theory]
    [InlineData("Classic")]
    [InlineData("Khet2Classic")]
    [InlineData("Imhotep")]
    [InlineData("Dynasty")]
    [InlineData("Khet2Imhotep")]
    [InlineData("Khet2Dynasty")]
    public void Opening_laser_destroys_nothing_for_either_player(string name)
    {
        var board = BoardLayouts.For(name).Build();

        foreach (var shooter in new[] { Player.P1, Player.P2 })
        {
            var (_, outcome) = GameEngine.FireLaser(board, shooter);
            Assert.Empty(outcome.Eliminated);
        }
    }

    // A Khet2 Sphinx rotate re-aims the beam down the player's own back row — a single legal
    // move away from the opening, and one either player can make on turn 1. Caught live after
    // deploy: the first Khet2Classic Anubis orientations survived the *opening* beam (straight
    // up/down the emitter column) but not this one — the beam entered from the side/back and
    // destroyed the mover's own Anubis on their own turn. Khet2Dynasty hit the same failure
    // shape on two of its own (unconverted) pyramids, not just its Anubis — see
    // BoardLayouts.Khet2Classic's and BoardLayouts.Khet2Dynasty's remarks.
    [Theory]
    [InlineData("Khet2Classic", Player.P1, 7, 9)]
    [InlineData("Khet2Classic", Player.P2, 0, 0)]
    [InlineData("Khet2Imhotep", Player.P1, 7, 9)]
    [InlineData("Khet2Imhotep", Player.P2, 0, 0)]
    [InlineData("Khet2Dynasty", Player.P1, 7, 9)]
    [InlineData("Khet2Dynasty", Player.P2, 0, 0)]
    public void Khet2_own_sphinx_rotate_does_not_destroy_the_own_piece_in_its_new_lane(
        string name, Player shooter, int sphinxRow, int sphinxCol)
    {
        var board = BoardLayouts.For(name).Build();
        var rotated = GameEngine.ApplyMove(board, EngineMove.Turn(new Coord(sphinxRow, sphinxCol), RotationDir.CW));

        var (_, outcome) = GameEngine.FireLaser(rotated, shooter);

        Assert.Empty(outcome.Eliminated);
    }

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
            [new(3, 1)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null), // corrected, see BoardLayouts.cs
            [new(3, 4)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(3, 5)] = new(Piece.Djed, Player.P2, Orientation.NW, null),
            [new(3, 8)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(3, 9)] = new(Piece.Pyramid, Player.P1, Orientation.NW, null),
            [new(4, 0)] = new(Piece.Pyramid, Player.P2, Orientation.SE, null),
            [new(4, 1)] = new(Piece.Pyramid, Player.P1, Orientation.NE, null),
            [new(4, 4)] = new(Piece.Djed, Player.P1, Orientation.NW, null),
            [new(4, 5)] = new(Piece.Pyramid, Player.P2, Orientation.NW, null),
            [new(4, 8)] = new(Piece.Pyramid, Player.P2, Orientation.NE, null),
            [new(4, 9)] = new(Piece.Pyramid, Player.P1, Orientation.SW, null), // corrected, see BoardLayouts.cs
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
            [new(2, 4)] = new(Piece.Pyramid, Player.P2, Orientation.SW, null), // corrected, see BoardLayouts.cs
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
    [InlineData("Khet2Imhotep")]
    [InlineData("Khet2Dynasty")]
    public void Khet2_alt_layouts_have_the_standard_khet2_piece_counts_per_side(string name)
    {
        var layout = BoardLayouts.For(name);

        Assert.Equal(8, layout.Rows);
        Assert.Equal(10, layout.Cols);
        Assert.Equal(26, layout.Pieces.Count);
        foreach (var player in new[] { Player.P1, Player.P2 })
        {
            var owned = layout.Pieces.Where(p => p.Owner == player).ToList();
            Assert.Equal(13, owned.Count);
            Assert.Equal(7, owned.Count(p => p.Kind == Piece.Pyramid));
            Assert.Equal(2, owned.Count(p => p.Kind == Piece.Djed));
            Assert.Equal(2, owned.Count(p => p.Kind == Piece.Anubis));
            Assert.Equal(1, owned.Count(p => p.Kind == Piece.Pharaoh));
            Assert.Equal(1, owned.Count(p => p.Kind == Piece.Sphinx));
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

    [Theory]
    [InlineData("Khet2Imhotep")]
    [InlineData("khet2imhotep")]
    [InlineData("Khet2Dynasty")]
    [InlineData("KHET2DYNASTY")]
    public void For_resolves_the_khet2_alt_layouts_case_insensitively(string name)
    {
        var expected = name.Equals("Khet2Imhotep", StringComparison.OrdinalIgnoreCase) ? BoardLayouts.Khet2Imhotep : BoardLayouts.Khet2Dynasty;
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
