using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Engine.Tests;

/// <summary>
/// The default starting board (<see cref="GameEngine.CreateStartingBoard"/> = Dawn, fixed emitter)
/// plus the square-reservation and emitter rules every setup is built around. Dawn's full piece
/// list is pinned in <see cref="BoardLayoutTests"/>' <c>Setup_matches_its_signed_off_board</c>.
/// </summary>
public class StartingBoardTests
{
    private static readonly Board Start = GameEngine.CreateStartingBoard();

    [Fact]
    public void Has_24_pieces()
    {
        Assert.Equal(24, Start.Pieces.Count);
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
    public void Pharaohs_start_at_7_6_for_P1_and_0_3_for_P2()
    {
        Assert.Equal(new PieceOnBoard(Piece.Pharaoh, Player.P1, null, null), Start.PieceAt(new Coord(7, 6)));
        Assert.Equal(new PieceOnBoard(Piece.Pharaoh, Player.P2, null, null), Start.PieceAt(new Coord(0, 3)));
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
