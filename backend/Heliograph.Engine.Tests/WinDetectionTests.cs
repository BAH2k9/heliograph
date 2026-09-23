using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Engine.Tests;

public class WinDetectionTests
{
    [Fact]
    public void Both_keeps_present_is_in_progress()
    {
        Assert.Equal(GameStatus.InProgress, GameEngine.CheckWin(GameEngine.CreateStartingBoard()));
    }

    [Fact]
    public void No_P1_keep_means_P2_wins()
    {
        var board = TestBoard.With((new Coord(0, 5), TestBoard.Keep(Player.P2)));

        Assert.Equal(GameStatus.P2Win, GameEngine.CheckWin(board));
    }

    [Fact]
    public void No_P2_keep_means_P1_wins()
    {
        var board = TestBoard.With((new Coord(7, 4), TestBoard.Keep(Player.P1)));

        Assert.Equal(GameStatus.P1Win, GameEngine.CheckWin(board));
    }

    [Fact]
    public void A_player_who_lasers_their_own_keep_loses()
    {
        // P1's beam climbs column 9; put P1's own keep in its path.
        var board = TestBoard.With((new Coord(4, 9), TestBoard.Keep(Player.P1)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.Equal(LaserTermination.HitKeep, outcome.Termination);
        Assert.Equal(GameStatus.P2Win, GameEngine.CheckWin(after));
    }
}
