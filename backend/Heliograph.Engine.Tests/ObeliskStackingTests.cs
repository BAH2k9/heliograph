using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Engine.Tests;

/// <summary>
/// Classic-ruleset obelisk stacking: the <see cref="MoveKind.Stack"/> / <see cref="MoveKind.Unstack"/>
/// moves. The laser side (a hit peels the top obelisk off a two-high stack) is unchanged and already
/// covered by <c>LaserWalkTests.Obelisk_takes_two_hits_the_first_damages_it_the_second_removes_it</c>.
/// </summary>
public class ObeliskStackingTests
{
    private static readonly Coord A = new(4, 4);
    private static readonly Coord B = new(4, 5);

    // --- Stack: validation ---

    [Fact]
    public void Stack_is_legal_between_two_adjacent_owned_single_obelisks()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 1)),
            (B, TestBoard.Obelisk(Player.P1, health: 1)));

        Assert.True(GameEngine.ValidateMove(board, EngineMove.Stack(A, B), Player.P1).IsLegal);
    }

    [Fact]
    public void Stack_defaults_to_the_classic_ruleset_when_none_is_passed()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 1)),
            (B, TestBoard.Obelisk(Player.P1, health: 1)));

        // No RuleSet argument — the overload defaults to RuleSets.Classic, which stacks.
        Assert.True(GameEngine.ValidateMove(board, EngineMove.Stack(A, B), Player.P1).IsLegal);
    }

    [Fact]
    public void Stack_is_rejected_when_the_ruleset_has_no_stacking()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 1)),
            (B, TestBoard.Obelisk(Player.P1, health: 1)));

        var result = GameEngine.ValidateMove(board, EngineMove.Stack(A, B), Player.P1, RuleSets.Khet2);

        Assert.False(result.IsLegal);
        Assert.Equal("stacking is not enabled for this ruleset", result.Reason);
    }

    [Fact]
    public void Stack_is_rejected_across_a_gap()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 1)),
            (new Coord(4, 6), TestBoard.Obelisk(Player.P1, health: 1)));

        var result = GameEngine.ValidateMove(board, EngineMove.Stack(A, new Coord(4, 6)), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("stack target is not an adjacent square", result.Reason);
    }

    [Fact]
    public void Stack_is_rejected_onto_an_enemy_obelisk()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 1)),
            (B, TestBoard.Obelisk(Player.P2, health: 1)));

        var result = GameEngine.ValidateMove(board, EngineMove.Stack(A, B), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("a stack target must be your own single obelisk", result.Reason);
    }

    [Fact]
    public void Stack_is_rejected_onto_a_non_obelisk()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 1)),
            (B, TestBoard.Pyramid(Orientation.NE, Player.P1)));

        var result = GameEngine.ValidateMove(board, EngineMove.Stack(A, B), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("a stack target must be your own single obelisk", result.Reason);
    }

    [Fact]
    public void Stack_is_rejected_from_a_non_obelisk()
    {
        var board = TestBoard.With(
            (A, TestBoard.Pyramid(Orientation.NE, Player.P1)),
            (B, TestBoard.Obelisk(Player.P1, health: 1)));

        var result = GameEngine.ValidateMove(board, EngineMove.Stack(A, B), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("only a single obelisk can be stacked", result.Reason);
    }

    [Fact]
    public void Stack_is_rejected_when_the_source_is_already_two_high()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 2)),
            (B, TestBoard.Obelisk(Player.P1, health: 1)));

        var result = GameEngine.ValidateMove(board, EngineMove.Stack(A, B), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("only a single obelisk can be stacked", result.Reason);
    }

    [Fact]
    public void Stack_is_rejected_when_the_target_is_already_two_high()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 1)),
            (B, TestBoard.Obelisk(Player.P1, health: 2)));

        var result = GameEngine.ValidateMove(board, EngineMove.Stack(A, B), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("a stack target must be your own single obelisk", result.Reason);
    }

    // --- Stack: application (merges, does not swap) ---

    [Fact]
    public void Applying_a_stack_merges_the_two_obelisks_into_one_two_high_stack()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 1)),
            (B, TestBoard.Obelisk(Player.P1, health: 1)));

        var next = GameEngine.ApplyMove(board, EngineMove.Stack(A, B));

        Assert.Null(next.PieceAt(A));
        Assert.Equal(Piece.Obelisk, next.PieceAt(B)!.Kind);
        Assert.Equal(Player.P1, next.PieceAt(B)!.Owner);
        Assert.Equal(2, next.PieceAt(B)!.Health);
        Assert.Single(next.Pieces); // a swap would leave two pieces on the board
        Assert.Equal(2, board.Pieces.Count); // original untouched
    }

    // --- Unstack: validation ---

    [Fact]
    public void Unstack_is_legal_from_a_two_high_obelisk_onto_an_adjacent_empty_square()
    {
        var board = TestBoard.With((A, TestBoard.Obelisk(Player.P1, health: 2)));

        Assert.True(GameEngine.ValidateMove(board, EngineMove.Unstack(A, B), Player.P1).IsLegal);
    }

    [Fact]
    public void Unstack_is_rejected_when_the_ruleset_has_no_stacking()
    {
        var board = TestBoard.With((A, TestBoard.Obelisk(Player.P1, health: 2)));

        var result = GameEngine.ValidateMove(board, EngineMove.Unstack(A, B), Player.P1, RuleSets.Khet2);

        Assert.False(result.IsLegal);
        Assert.Equal("stacking is not enabled for this ruleset", result.Reason);
    }

    [Fact]
    public void Unstack_is_rejected_from_a_single_obelisk()
    {
        var board = TestBoard.With((A, TestBoard.Obelisk(Player.P1, health: 1)));

        var result = GameEngine.ValidateMove(board, EngineMove.Unstack(A, B), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("only a two-high obelisk can be unstacked", result.Reason);
    }

    [Fact]
    public void Unstack_is_rejected_onto_an_occupied_square()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 2)),
            (B, TestBoard.Pyramid(Orientation.NE, Player.P1)));

        var result = GameEngine.ValidateMove(board, EngineMove.Unstack(A, B), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("destination is occupied", result.Reason);
    }

    [Fact]
    public void Unstack_is_rejected_off_the_board()
    {
        var edge = new Coord(0, 4);
        var board = TestBoard.With((edge, TestBoard.Obelisk(Player.P1, health: 2)));

        var result = GameEngine.ValidateMove(board, EngineMove.Unstack(edge, new Coord(-1, 4)), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("destination is off the board", result.Reason);
    }

    [Fact]
    public void Unstack_is_rejected_onto_the_opponents_restricted_square()
    {
        var from = new Coord(1, 1);
        var board = TestBoard.With((from, TestBoard.Obelisk(Player.P1, health: 2)));

        var result = GameEngine.ValidateMove(board, EngineMove.Unstack(from, new Coord(1, 0)), Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("cannot unstack onto opponent's restricted square", result.Reason);
    }

    // --- Unstack: application (splits, does not relocate) ---

    [Fact]
    public void Applying_an_unstack_leaves_a_single_obelisk_on_each_square()
    {
        var board = TestBoard.With((A, TestBoard.Obelisk(Player.P1, health: 2)));

        var next = GameEngine.ApplyMove(board, EngineMove.Unstack(A, B));

        Assert.Equal(1, next.PieceAt(A)!.Health);
        Assert.Equal(Piece.Obelisk, next.PieceAt(B)!.Kind);
        Assert.Equal(Player.P1, next.PieceAt(B)!.Owner);
        Assert.Equal(1, next.PieceAt(B)!.Health);
        Assert.Equal(2, next.Pieces.Count); // relocating the whole stack would leave only one
        Assert.Equal(2, board.PieceAt(A)!.Health); // original untouched
    }

    // --- Full turn: stack, then the laser fires as usual ---

    [Fact]
    public void A_stack_move_is_a_full_turn_the_laser_still_fires_afterwards()
    {
        var board = TestBoard.With(
            (A, TestBoard.Obelisk(Player.P1, health: 1)),
            (B, TestBoard.Obelisk(Player.P1, health: 1)),
            (new Coord(7, 4), TestBoard.Pharaoh(Player.P1)),
            (new Coord(0, 5), TestBoard.Pharaoh(Player.P2)));
        var move = EngineMove.Stack(A, B);

        Assert.True(GameEngine.ValidateMove(board, move, Player.P1).IsLegal);
        var afterMove = GameEngine.ApplyMove(board, move);
        var (afterLaser, outcome) = GameEngine.FireLaser(afterMove, Player.P1);

        Assert.Equal(2, afterMove.PieceAt(B)!.Health);
        Assert.Equal(LaserTermination.ExitedBoard, outcome.Termination); // column 9 is clear
        Assert.Equal(GameStatus.InProgress, GameEngine.CheckWin(afterLaser));
    }
}
