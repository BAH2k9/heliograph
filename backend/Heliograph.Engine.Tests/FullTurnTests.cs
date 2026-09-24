using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Engine.Tests;

public class FullTurnTests
{
    [Fact]
    public void A_quiet_opening_move_then_the_laser_leaves_the_game_in_progress()
    {
        var board = GameEngine.CreateStartingBoard();
        var move = EngineMove.Shift(new Coord(7, 2), new Coord(6, 1)); // Dawn: P1's far-left mirror steps forward

        Assert.True(GameEngine.ValidateMove(board, move, Player.P1).IsLegal);
        board = GameEngine.ApplyMove(board, move);
        var (afterLaser, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.NotEqual(LaserTermination.HitKeep, outcome.Termination);
        Assert.Equal(GameStatus.InProgress, GameEngine.CheckWin(afterLaser));
    }

    [Fact]
    public void Rotating_a_reflector_can_steer_the_beam_into_the_enemy_keep_and_win()
    {
        var mirrorAt = new Coord(4, 9);
        var enemyKeep = new Coord(4, 5);
        var board = TestBoard.With(
            (mirrorAt, TestBoard.Mirror(Orientation.NW, Player.P1)), // blank face to the beam — absorbs it
            (enemyKeep, TestBoard.Keep(Player.P2)),
            (new Coord(7, 0), TestBoard.Keep(Player.P1)));

        // As it stands, P1's own mirror eats the beam; nobody wins.
        var (before, _) = GameEngine.FireLaser(board, Player.P1);
        Assert.Equal(GameStatus.InProgress, GameEngine.CheckWin(before));

        // Rotate the mirror NW -> SW so the climbing beam turns west along row 4.
        var rotate = EngineMove.Turn(mirrorAt, RotationDir.CCW);
        Assert.True(GameEngine.ValidateMove(board, rotate, Player.P1).IsLegal);
        var turned = GameEngine.ApplyMove(board, rotate);

        var (after, outcome) = GameEngine.FireLaser(turned, Player.P1);

        Assert.Equal(LaserTermination.HitKeep, outcome.Termination);
        Assert.Contains(enemyKeep, outcome.Eliminated);
        Assert.Equal(GameStatus.P1Win, GameEngine.CheckWin(after));
    }
}
