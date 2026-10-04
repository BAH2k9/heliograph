using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Engine.Tests;

public class LaserWalkTests
{
    private static LaserSegment Seg(int r, int c, LaserEdge enter, LaserEdge? exit) => new(r, c, enter, exit);

    [Fact]
    public void Empty_board_P1_beam_climbs_column_9_and_exits_the_top()
    {
        var (after, outcome) = GameEngine.FireLaser(TestBoard.Empty(), Player.P1);

        Assert.Equal(LaserTermination.ExitedBoard, outcome.Termination);
        Assert.Null(outcome.HitCell);
        Assert.Empty(outcome.Eliminated);
        Assert.Empty(outcome.Damaged);
        Assert.Equal(8, outcome.Segments.Count);
        Assert.All(outcome.Segments, s =>
        {
            Assert.Equal(9, s.Col);
            Assert.Equal(LaserEdge.Bottom, s.Enter);
            Assert.Equal(LaserEdge.Top, s.Exit);
        });
        Assert.Empty(after.Pieces);
    }

    [Fact]
    public void Empty_board_P2_beam_descends_column_0_and_exits_the_bottom()
    {
        var (_, outcome) = GameEngine.FireLaser(TestBoard.Empty(), Player.P2);

        Assert.Equal(LaserTermination.ExitedBoard, outcome.Termination);
        Assert.Equal(8, outcome.Segments.Count);
        Assert.All(outcome.Segments, s =>
        {
            Assert.Equal(0, s.Col);
            Assert.Equal(LaserEdge.Top, s.Enter);
            Assert.Equal(LaserEdge.Bottom, s.Exit);
        });
    }

    // Dawn (the ported Classic board, IP-02 reversal) is the default and its opening beam
    // deflects several times before leaving the board, which makes it the more telling reference
    // trace.
    private static Board DawnStart() => BoardLayouts.Dawn.Build();

    [Fact]
    public void Opening_position_P1_laser_path_matches_the_reference_trace()
    {
        var expected = new[]
        {
            Seg(7, 9, LaserEdge.Bottom, LaserEdge.Top),
            Seg(6, 9, LaserEdge.Bottom, LaserEdge.Top),
            Seg(5, 9, LaserEdge.Bottom, LaserEdge.Top),
            Seg(4, 9, LaserEdge.Bottom, LaserEdge.Left),  // P1's own mirror SW turns it west
            Seg(4, 8, LaserEdge.Right, LaserEdge.Left),
            Seg(4, 7, LaserEdge.Right, LaserEdge.Top),    // P2's mirror NE turns it north
            Seg(3, 7, LaserEdge.Bottom, LaserEdge.Right),  // P2's mirror SE turns it east
            Seg(3, 8, LaserEdge.Left, LaserEdge.Right),
            Seg(3, 9, LaserEdge.Left, LaserEdge.Top),      // P1's mirror NW turns it north
            Seg(2, 9, LaserEdge.Bottom, LaserEdge.Top),
            Seg(1, 9, LaserEdge.Bottom, LaserEdge.Top),
            Seg(0, 9, LaserEdge.Bottom, LaserEdge.Top),
        };

        var (_, outcome) = GameEngine.FireLaser(DawnStart(), Player.P1);

        Assert.Equal(expected, outcome.Segments);
        Assert.Equal(LaserTermination.ExitedBoard, outcome.Termination);
        Assert.Empty(outcome.Eliminated);
    }

    [Fact]
    public void Opening_position_P2_laser_path_matches_the_reference_trace()
    {
        var expected = new[]
        {
            Seg(0, 0, LaserEdge.Top, LaserEdge.Bottom),
            Seg(1, 0, LaserEdge.Top, LaserEdge.Bottom),
            Seg(2, 0, LaserEdge.Top, LaserEdge.Bottom),
            Seg(3, 0, LaserEdge.Top, LaserEdge.Right),    // P2's own mirror NE turns it east
            Seg(3, 1, LaserEdge.Left, LaserEdge.Right),
            Seg(3, 2, LaserEdge.Left, LaserEdge.Bottom),  // P1's mirror SW turns it south
            Seg(4, 2, LaserEdge.Top, LaserEdge.Left),     // P1's mirror NW turns it west
            Seg(4, 1, LaserEdge.Right, LaserEdge.Left),
            Seg(4, 0, LaserEdge.Right, LaserEdge.Bottom),  // P2's mirror SE turns it south
            Seg(5, 0, LaserEdge.Top, LaserEdge.Bottom),
            Seg(6, 0, LaserEdge.Top, LaserEdge.Bottom),
            Seg(7, 0, LaserEdge.Top, LaserEdge.Bottom),
        };

        var (_, outcome) = GameEngine.FireLaser(DawnStart(), Player.P2);

        Assert.Equal(expected, outcome.Segments);
        Assert.Equal(LaserTermination.ExitedBoard, outcome.Termination);
        Assert.Empty(outcome.Eliminated);
    }

    [Fact]
    public void Segments_run_in_order_from_the_emitter_to_the_terminus()
    {
        var (_, outcome) = GameEngine.FireLaser(DawnStart(), Player.P1);

        Assert.Equal((7, 9), (outcome.Segments[0].Row, outcome.Segments[0].Col));
        for (var i = 1; i < outcome.Segments.Count; i++)
        {
            var prev = outcome.Segments[i - 1];
            var cur = outcome.Segments[i];
            var expected = prev.Exit switch
            {
                LaserEdge.Top => (prev.Row - 1, prev.Col),
                LaserEdge.Bottom => (prev.Row + 1, prev.Col),
                LaserEdge.Left => (prev.Row, prev.Col - 1),
                LaserEdge.Right => (prev.Row, prev.Col + 1),
                _ => (prev.Row, prev.Col),
            };
            Assert.Equal(expected, (cur.Row, cur.Col));
        }
    }

    [Theory]
    [InlineData(Orientation.SW, LaserEdge.Left)]  // Mirror[(Down, SW)] = Left
    [InlineData(Orientation.SE, LaserEdge.Right)] // Mirror[(Down, SE)] = Right — reflects off the board east
    public void Mirror_hit_on_a_mirrored_face_reflects_and_survives(Orientation orientation, LaserEdge exitEdge)
    {
        var at = new Coord(4, 9);
        var board = TestBoard.With((at, TestBoard.Mirror(orientation, Player.P2)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.NotNull(after.PieceAt(at));
        Assert.Empty(outcome.Eliminated);
        Assert.Equal(LaserTermination.ExitedBoard, outcome.Termination);
        Assert.Equal(exitEdge, outcome.Segments.Single(s => s is { Row: 4, Col: 9 }).Exit);
    }

    [Theory]
    [InlineData(Orientation.NW)] // Mirror[(Down, NW)] = Stop
    [InlineData(Orientation.NE)] // Mirror[(Down, NE)] = Stop
    public void Mirror_hit_on_a_blank_face_is_absorbed_and_removed(Orientation orientation)
    {
        var at = new Coord(4, 9);
        var board = TestBoard.With((at, TestBoard.Mirror(orientation, Player.P2)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.Equal(LaserTermination.Absorbed, outcome.Termination);
        Assert.Equal(at, outcome.HitCell);
        Assert.Contains(at, outcome.Eliminated);
        Assert.Null(after.PieceAt(at));
        Assert.Null(outcome.Segments[^1].Exit);
    }

    [Theory]
    [InlineData(Orientation.NW)]
    [InlineData(Orientation.NE)]
    [InlineData(Orientation.SE)]
    [InlineData(Orientation.SW)]
    public void Swivel_reflects_every_face_and_is_never_removed(Orientation orientation)
    {
        var at = new Coord(4, 9);
        var board = TestBoard.With((at, TestBoard.Swivel(orientation, Player.P2)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.NotNull(after.PieceAt(at));
        Assert.Empty(outcome.Eliminated);
        Assert.NotEqual(LaserTermination.Absorbed, outcome.Termination);
        Assert.NotEqual(LaserTermination.HitKeep, outcome.Termination);
    }

    [Fact]
    public void Beam_into_a_keep_ends_the_game()
    {
        var at = new Coord(4, 9);
        var board = TestBoard.With(
            (at, TestBoard.Keep(Player.P2)),
            (new Coord(7, 0), TestBoard.Keep(Player.P1))); // out of the column-9 beam's path

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.Equal(LaserTermination.HitKeep, outcome.Termination);
        Assert.Equal(at, outcome.HitCell);
        Assert.Contains(at, outcome.Eliminated);
        Assert.Null(after.PieceAt(at));
        Assert.Equal(GameStatus.P1Win, GameEngine.CheckWin(after));
    }

    [Fact]
    public void Bastion_takes_two_hits_the_first_damages_it_the_second_removes_it()
    {
        var at = new Coord(4, 9);
        var board = TestBoard.With((at, TestBoard.Bastion(Player.P2, health: 2)));

        var (afterFirst, first) = GameEngine.FireLaser(board, Player.P1);

        Assert.Equal(LaserTermination.Absorbed, first.Termination);
        Assert.Empty(first.Eliminated);
        Assert.Contains(new LaserDamage(at, 1), first.Damaged);
        Assert.Equal(1, afterFirst.PieceAt(at)!.Health);

        var (afterSecond, second) = GameEngine.FireLaser(afterFirst, Player.P1);

        Assert.Equal(LaserTermination.Absorbed, second.Termination);
        Assert.Contains(at, second.Eliminated);
        Assert.Empty(second.Damaged);
        Assert.Null(afterSecond.PieceAt(at));
    }

    [Fact]
    public void WalkLaser_cuts_off_a_beam_that_re_enters_a_state_it_has_already_seen()
    {
        // Four Swivels form a closed square. A beam launched east from (2,1) is turned
        // south -> west -> north -> east and arrives back at (2,1) heading east — the
        // exact (square, direction) it started from. The walk must stop, not spin.
        var board = TestBoard.With(
            (new Coord(2, 2), TestBoard.Swivel(Orientation.NE)),
            (new Coord(4, 2), TestBoard.Swivel(Orientation.NW)),
            (new Coord(4, 0), TestBoard.Swivel(Orientation.NE)),
            (new Coord(2, 0), TestBoard.Swivel(Orientation.NW)));

        var (_, outcome) = GameEngine.WalkLaser(board, new Coord(2, 1), Direction.Right);

        Assert.Equal(LaserTermination.ExitedBoard, outcome.Termination);
        Assert.Empty(outcome.Eliminated);
        Assert.True(outcome.Segments.Count <= GameEngine.Rows * GameEngine.Cols * 4);
    }
}
