using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Engine.Tests;

public class LegalMovesTests
{
    [Fact]
    public void Every_returned_move_agrees_with_ValidateMove()
    {
        var board = GameEngine.CreateStartingBoard();

        var moves = GameEngine.LegalMoves(board, Player.P1);

        Assert.NotEmpty(moves);
        Assert.All(moves, move => Assert.True(GameEngine.ValidateMove(board, move, Player.P1).IsLegal));
    }

    [Fact]
    public void Opening_position_has_a_nonzero_move_count_for_both_players()
    {
        var board = GameEngine.CreateStartingBoard();

        var p1Moves = GameEngine.LegalMoves(board, Player.P1);
        var p2Moves = GameEngine.LegalMoves(board, Player.P2);

        // Classic's starting layout is symmetric, so both sides see the same move count.
        Assert.Equal(p1Moves.Count, p2Moves.Count);
        Assert.True(p1Moves.Count > 0);
    }

    [Fact]
    public void A_board_with_only_the_opponents_pieces_has_no_legal_moves()
    {
        var board = TestBoard.With((new Coord(4, 4), TestBoard.Pyramid(Orientation.NE, Player.P2)));

        var moves = GameEngine.LegalMoves(board, Player.P1);

        Assert.Empty(moves);
    }

    [Fact]
    public void Includes_both_rotation_directions_for_a_lone_rotatable_piece()
    {
        var board = TestBoard.With((new Coord(4, 4), TestBoard.Pyramid(Orientation.NE, Player.P1)));

        var moves = GameEngine.LegalMoves(board, Player.P1);

        Assert.Contains(moves, m => m.Kind == MoveKind.Rotate && m.Rotation == RotationDir.CW);
        Assert.Contains(moves, m => m.Kind == MoveKind.Rotate && m.Rotation == RotationDir.CCW);
    }

    [Fact]
    public void Obelisk_cannot_rotate_but_can_shift()
    {
        var board = TestBoard.With((new Coord(4, 4), TestBoard.Obelisk(Player.P1, health: 1)));

        var moves = GameEngine.LegalMoves(board, Player.P1);

        Assert.DoesNotContain(moves, m => m.Kind == MoveKind.Rotate);
        Assert.Contains(moves, m => m.Kind == MoveKind.Move);
    }
}
