using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Api.Tests.Engine;

public class FullTurnTests
{
    [Fact]
    public void A_quiet_opening_move_then_the_laser_leaves_the_game_in_progress()
    {
        var board = GameEngine.CreateStartingBoard();
        var move = EngineMove.Shift(new Coord(2, 3), new Coord(2, 4));

        Assert.True(GameEngine.ValidateMove(board, move, Player.P1).IsLegal);
        board = GameEngine.ApplyMove(board, move);
        var (afterLaser, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.NotEqual(LaserTermination.HitPharaoh, outcome.Termination);
        Assert.Equal(GameStatus.InProgress, GameEngine.CheckWin(afterLaser));
    }

    [Fact]
    public void Rotating_a_reflector_can_steer_the_beam_into_the_enemy_pharaoh_and_win()
    {
        var pyramidAt = new Coord(4, 9);
        var enemyPharaoh = new Coord(4, 5);
        var board = TestBoard.With(
            (pyramidAt, TestBoard.Pyramid(Orientation.NW, Player.P1)), // blank face to the beam — absorbs it
            (enemyPharaoh, TestBoard.Pharaoh(Player.P2)),
            (new Coord(7, 0), TestBoard.Pharaoh(Player.P1)));

        // As it stands, P1's own pyramid eats the beam; nobody wins.
        var (before, _) = GameEngine.FireLaser(board, Player.P1);
        Assert.Equal(GameStatus.InProgress, GameEngine.CheckWin(before));

        // Rotate the pyramid NW -> SW so the climbing beam turns west along row 4.
        var rotate = EngineMove.Turn(pyramidAt, RotationDir.CCW);
        Assert.True(GameEngine.ValidateMove(board, rotate, Player.P1).IsLegal);
        var turned = GameEngine.ApplyMove(board, rotate);

        var (after, outcome) = GameEngine.FireLaser(turned, Player.P1);

        Assert.Equal(LaserTermination.HitPharaoh, outcome.Termination);
        Assert.Contains(enemyPharaoh, outcome.Eliminated);
        Assert.Equal(GameStatus.P1Win, GameEngine.CheckWin(after));
    }
}
