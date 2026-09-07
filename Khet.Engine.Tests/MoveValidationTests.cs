using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Api.Tests.Engine;

public class MoveValidationTests
{
    private static Board Single(Coord at, PieceOnBoard piece) => TestBoard.With((at, piece));

    [Fact]
    public void Rejects_when_there_is_no_piece_on_the_from_square()
    {
        var move = EngineMove.Shift(new Coord(4, 4), new Coord(4, 5));

        var result = GameEngine.ValidateMove(TestBoard.Empty(), move, Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("no piece at from", result.Reason);
    }

    [Fact]
    public void Rejects_moving_a_piece_the_player_does_not_own()
    {
        var board = Single(new Coord(4, 4), TestBoard.Pyramid(Orientation.NE, Player.P2));
        var move = EngineMove.Shift(new Coord(4, 4), new Coord(4, 5));

        var result = GameEngine.ValidateMove(board, move, Player.P1);

        Assert.False(result.IsLegal);
        Assert.NotNull(result.Reason);
    }

    [Theory]
    [InlineData(4, 6)] // two columns away
    [InlineData(6, 4)] // two rows away
    [InlineData(2, 2)] // diagonal, too far
    public void Rejects_a_destination_that_is_not_adjacent(int toRow, int toCol)
    {
        var board = Single(new Coord(4, 4), TestBoard.Pyramid(Orientation.NE, Player.P1));
        var move = EngineMove.Shift(new Coord(4, 4), new Coord(toRow, toCol));

        var result = GameEngine.ValidateMove(board, move, Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("move is not to an adjacent square", result.Reason);
    }

    [Fact]
    public void Rejects_a_move_that_does_not_change_square()
    {
        var board = Single(new Coord(4, 4), TestBoard.Pyramid(Orientation.NE, Player.P1));
        var move = EngineMove.Shift(new Coord(4, 4), new Coord(4, 4));

        Assert.False(GameEngine.ValidateMove(board, move, Player.P1).IsLegal);
    }

    [Theory]
    [InlineData(1, 0, Player.P1)]  // column 0 is reserved for P2
    [InlineData(0, 8, Player.P1)]
    [InlineData(7, 8, Player.P1)]
    [InlineData(1, 9, Player.P2)]  // column 9 is reserved for P1
    [InlineData(0, 1, Player.P2)]
    [InlineData(7, 1, Player.P2)]
    public void Rejects_moving_onto_the_opponents_restricted_square(int toRow, int toCol, Player mover)
    {
        var from = new Coord(toRow == 0 ? 1 : toRow - 1, toCol == 0 ? 1 : toCol - 1);
        var board = Single(from, TestBoard.Pyramid(Orientation.NE, mover));
        var move = EngineMove.Shift(from, new Coord(toRow, toCol));

        var result = GameEngine.ValidateMove(board, move, mover);

        Assert.False(result.IsLegal);
        Assert.Equal("cannot move onto opponent's restricted square", result.Reason);
    }

    [Theory]
    [InlineData(6, 9, Player.P1)] // adjacent to the P1 emitter at (7,9)
    [InlineData(1, 0, Player.P2)] // adjacent to the P2 emitter at (0,0)
    public void Rejects_moving_onto_the_laser_emitter(int fromRow, int fromCol, Player mover)
    {
        var emitter = mover == Player.P1 ? new Coord(7, 9) : new Coord(0, 0);
        var board = Single(new Coord(fromRow, fromCol), TestBoard.Pyramid(Orientation.NE, mover));
        var move = EngineMove.Shift(new Coord(fromRow, fromCol), emitter);

        var result = GameEngine.ValidateMove(board, move, mover);

        Assert.False(result.IsLegal);
        Assert.Equal("cannot move onto the laser emitter", result.Reason);
    }

    [Fact]
    public void Rejects_a_non_djed_moving_onto_an_occupied_square()
    {
        var board = TestBoard.With(
            (new Coord(4, 4), TestBoard.Pyramid(Orientation.NE, Player.P1)),
            (new Coord(4, 5), TestBoard.Pyramid(Orientation.NW, Player.P2)));
        var move = EngineMove.Shift(new Coord(4, 4), new Coord(4, 5));

        var result = GameEngine.ValidateMove(board, move, Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("destination is occupied", result.Reason);
    }

    [Theory]
    [InlineData(0, 1)]  // orthogonal
    [InlineData(1, 0)]
    [InlineData(1, 1)]  // diagonal
    [InlineData(-1, -1)]
    public void Allows_a_move_to_any_adjacent_empty_neutral_square(int dRow, int dCol)
    {
        var from = new Coord(4, 4);
        var board = Single(from, TestBoard.Pyramid(Orientation.NE, Player.P1));
        var move = EngineMove.Shift(from, new Coord(from.Row + dRow, from.Col + dCol));

        Assert.True(GameEngine.ValidateMove(board, move, Player.P1).IsLegal);
    }

    [Fact]
    public void Allows_moving_onto_the_players_own_restricted_square()
    {
        var board = Single(new Coord(4, 8), TestBoard.Pyramid(Orientation.NE, Player.P1));
        var move = EngineMove.Shift(new Coord(4, 8), new Coord(4, 9)); // column 9 is P1's

        Assert.True(GameEngine.ValidateMove(board, move, Player.P1).IsLegal);
    }

    [Theory]
    [InlineData(Piece.Pyramid, true)]
    [InlineData(Piece.Obelisk, true)]
    [InlineData(Piece.Djed, false)]
    [InlineData(Piece.Pharaoh, false)]
    public void Djed_may_swap_only_with_an_adjacent_pyramid_or_obelisk(Piece occupantKind, bool legal)
    {
        var occupant = occupantKind switch
        {
            Piece.Pyramid => TestBoard.Pyramid(Orientation.NW, Player.P2),
            Piece.Obelisk => TestBoard.Obelisk(Player.P2),
            Piece.Djed => TestBoard.Djed(Orientation.NW, Player.P2),
            _ => TestBoard.Pharaoh(Player.P2),
        };
        var board = TestBoard.With(
            (new Coord(4, 4), TestBoard.Djed(Orientation.NE, Player.P1)),
            (new Coord(4, 5), occupant));
        var move = EngineMove.Shift(new Coord(4, 4), new Coord(4, 5));

        Assert.Equal(legal, GameEngine.ValidateMove(board, move, Player.P1).IsLegal);
    }

    [Theory]
    [InlineData(Orientation.NW, RotationDir.CW)]
    [InlineData(Orientation.NE, RotationDir.CCW)]
    [InlineData(Orientation.SE, RotationDir.CW)]
    [InlineData(Orientation.SW, RotationDir.CCW)]
    public void Allows_rotating_a_pyramid_or_djed_either_way(Orientation start, RotationDir dir)
    {
        var board = TestBoard.With(
            (new Coord(4, 4), TestBoard.Pyramid(start, Player.P1)),
            (new Coord(5, 5), TestBoard.Djed(start, Player.P1)));

        Assert.True(GameEngine.ValidateMove(board, EngineMove.Turn(new Coord(4, 4), dir), Player.P1).IsLegal);
        Assert.True(GameEngine.ValidateMove(board, EngineMove.Turn(new Coord(5, 5), dir), Player.P1).IsLegal);
    }

    [Fact]
    public void Rejects_rotating_an_obelisk()
    {
        var board = Single(new Coord(4, 4), TestBoard.Obelisk(Player.P1));

        var result = GameEngine.ValidateMove(board, EngineMove.Turn(new Coord(4, 4), RotationDir.CW), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("cannot rotate an obelisk", result.Reason);
    }

    [Fact]
    public void Rejects_rotating_a_pharaoh()
    {
        var board = Single(new Coord(4, 4), TestBoard.Pharaoh(Player.P1));

        Assert.False(GameEngine.ValidateMove(board, EngineMove.Turn(new Coord(4, 4), RotationDir.CW), Player.P1).IsLegal);
    }

    [Fact]
    public void Rejects_any_action_when_it_is_the_other_players_turn()
    {
        var board = Single(new Coord(4, 4), TestBoard.Pyramid(Orientation.NE, Player.P1));

        Assert.False(GameEngine.ValidateMove(board, EngineMove.Turn(new Coord(4, 4), RotationDir.CW), Player.P2).IsLegal);
        Assert.False(GameEngine.ValidateMove(board, EngineMove.Shift(new Coord(4, 4), new Coord(4, 5)), Player.P2).IsLegal);
    }
}
