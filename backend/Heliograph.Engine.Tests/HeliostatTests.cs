using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Engine.Tests;

/// <summary>
/// The Turning Sun rotating laser. The Heliostat is a piece on the board (a corner square), so its
/// behaviour is driven by piece kind, not a ruleset flag — a board that carries a player's
/// Heliostat fires from it; one that does not uses the fixed corner emitter.
/// </summary>
public class HeliostatTests
{
    private static PieceOnBoard Heliostat(Player p, Orientation o) => new(Piece.Heliostat, p, o, null);

    [Fact]
    public void P1_heliostat_facing_NE_fires_the_same_opening_beam_as_the_fixed_emitter()
    {
        var withHeliostat = TestBoard.With((new Coord(7, 9), Heliostat(Player.P1, Orientation.NE)));

        var (_, heliostatOutcome) = GameEngine.FireLaser(withHeliostat, Player.P1);
        var (_, fixedOutcome) = GameEngine.FireLaser(TestBoard.Empty(), Player.P1);

        // Pass-through, not step-ahead: segment 0 is still the Heliostat's own square, entered from below.
        Assert.Equal(heliostatOutcome.Segments, fixedOutcome.Segments);
        Assert.Equal(new Coord(7, 9), heliostatOutcome.Emitter);
        Assert.Equal(Direction.Up, heliostatOutcome.EmitterDirection);
        Assert.Equal((7, 9), (heliostatOutcome.Segments[0].Row, heliostatOutcome.Segments[0].Col));
        Assert.Equal(LaserEdge.Bottom, heliostatOutcome.Segments[0].Enter);
        Assert.Equal(LaserTermination.ExitedBoard, heliostatOutcome.Termination);
    }

    [Fact]
    public void P2_heliostat_facing_SW_fires_down_column_0()
    {
        var board = TestBoard.With((new Coord(0, 0), Heliostat(Player.P2, Orientation.SW)));

        var (_, outcome) = GameEngine.FireLaser(board, Player.P2);

        Assert.Equal(new Coord(0, 0), outcome.Emitter);
        Assert.Equal(Direction.Down, outcome.EmitterDirection);
        Assert.All(outcome.Segments, s => Assert.Equal(0, s.Col));
    }

    [Theory]
    [InlineData(RotationDir.CW)]
    [InlineData(RotationDir.CCW)]
    public void Rotating_the_p1_heliostat_toggles_it_between_its_two_facings_regardless_of_direction(RotationDir dir)
    {
        var board = TestBoard.With((new Coord(7, 9), Heliostat(Player.P1, Orientation.NE)));
        var turn = EngineMove.Turn(new Coord(7, 9), dir);

        Assert.True(GameEngine.ValidateMove(board, turn, Player.P1).IsLegal);

        var afterOne = GameEngine.ApplyMove(board, turn);
        Assert.Equal(Orientation.NW, afterOne.PieceAt(new Coord(7, 9))!.Orientation);

        var (_, outcome) = GameEngine.FireLaser(afterOne, Player.P1);
        Assert.Equal(Direction.Left, outcome.EmitterDirection);   // now fires left along row 7
        Assert.All(outcome.Segments, s => Assert.Equal(7, s.Row));

        var afterTwo = GameEngine.ApplyMove(afterOne, EngineMove.Turn(new Coord(7, 9), dir));
        Assert.Equal(Orientation.NE, afterTwo.PieceAt(new Coord(7, 9))!.Orientation);
    }

    [Fact]
    public void A_heliostat_cannot_be_moved()
    {
        var board = TestBoard.With(
            (new Coord(7, 9), Heliostat(Player.P1, Orientation.NE)),
            (new Coord(6, 9), TestBoard.Mirror(Orientation.NW, Player.P1)));

        var shift = EngineMove.Shift(new Coord(7, 9), new Coord(6, 8));
        var result = GameEngine.ValidateMove(board, shift, Player.P1);

        Assert.False(result.IsLegal);
        Assert.Equal("the heliostat cannot move", result.Reason);
    }

    [Fact]
    public void An_enemy_beam_into_a_heliostat_is_absorbed_and_the_heliostat_survives()
    {
        // P2 fires down column 0 into P1's Heliostat parked at (7,0).
        var board = TestBoard.With(
            (new Coord(0, 0), Heliostat(Player.P2, Orientation.SW)),
            (new Coord(7, 0), Heliostat(Player.P1, Orientation.NE)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P2);

        Assert.Equal(LaserTermination.Absorbed, outcome.Termination);
        Assert.Empty(outcome.Eliminated);
        Assert.Empty(outcome.Damaged);
        Assert.NotNull(after.PieceAt(new Coord(7, 0)));
        Assert.Equal(Piece.Heliostat, after.PieceAt(new Coord(7, 0))!.Kind);
        Assert.Equal(new Coord(7, 0), outcome.HitCell);
    }

    [Fact]
    public void A_beam_that_loops_back_to_the_shooters_own_heliostat_is_absorbed_not_passed_through()
    {
        // P1 Heliostat at (7,9) fires up; three mirrors steer it up col 9, left, down col 8, and
        // right along row 7 straight back into the Heliostat from the left.
        var board = TestBoard.With(
            (new Coord(7, 9), Heliostat(Player.P1, Orientation.NE)),
            (new Coord(3, 9), TestBoard.Mirror(Orientation.SW, Player.P1)),
            (new Coord(3, 8), TestBoard.Mirror(Orientation.SE, Player.P1)),
            (new Coord(7, 8), TestBoard.Mirror(Orientation.NE, Player.P1)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.Equal(LaserTermination.Absorbed, outcome.Termination);
        Assert.Equal(new Coord(7, 9), outcome.HitCell);
        Assert.Equal(Piece.Heliostat, after.PieceAt(new Coord(7, 9))!.Kind);
        Assert.Empty(outcome.Eliminated);
    }

    [Fact]
    public void Heliostat_presence_does_not_affect_win_detection()
    {
        var board = TestBoard.With(
            (new Coord(7, 9), Heliostat(Player.P1, Orientation.NE)),
            (new Coord(0, 0), Heliostat(Player.P2, Orientation.SW)),
            (new Coord(7, 4), TestBoard.Keep(Player.P1)),
            (new Coord(0, 5), TestBoard.Keep(Player.P2)));

        Assert.Equal(GameStatus.InProgress, GameEngine.CheckWin(board));
    }

    [Theory]
    [InlineData("Dawn")]
    [InlineData("Zenith")]
    [InlineData("Dusk")]
    public void Rotating_emitter_layout_has_one_heliostat_per_player_at_the_corners(string name)
    {
        var layout = BoardLayouts.For(name, RuleSets.TurningSun);
        var heliostates = layout.Pieces.Where(p => p.Kind == Piece.Heliostat).ToList();

        Assert.Equal(26, layout.Pieces.Count);
        Assert.Equal(2, heliostates.Count);
        Assert.Contains(heliostates, s => s.Owner == Player.P1 && s.At == new Coord(7, 9) && s.Orientation == Orientation.NE);
        Assert.Contains(heliostates, s => s.Owner == Player.P2 && s.At == new Coord(0, 0) && s.Orientation == Orientation.SW);
    }
}
