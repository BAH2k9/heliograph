using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Engine.Tests;

/// <summary>
/// Pins the reading of <see cref="LaserReflection"/>. The tables are byte-for-byte from the original engine
/// and every non-Stop entry is an involution, so the tables alone cannot say which "frame" the
/// key is in. The original engine.s consumer resolves it: the key is the side the beam ENTERS through
/// (== Opposite(travel direction)), and the value is the new travel direction used as-is.
/// Break that and every reflection mirrors while these and the walk tests are the only guard.
/// </summary>
public class LaserReflectionFrameTests
{
    [Fact]
    public void Mirror_table_is_an_involution_on_its_reflecting_entries()
    {
        foreach (var (key, exit) in LaserReflection.Mirror)
        {
            if (exit == Direction.Stop)
                continue;
            Assert.True(LaserReflection.Mirror.TryGetValue((exit, key.Item2), out var back));
            Assert.Equal(key.Item1, back);
        }
    }

    [Fact]
    public void Swivel_table_is_an_involution_on_every_entry()
    {
        foreach (var (key, exit) in LaserReflection.Swivel)
        {
            Assert.True(LaserReflection.Swivel.TryGetValue((exit, key.Item2), out var back));
            Assert.Equal(key.Item1, back);
        }
    }

    [Fact]
    public void Swivel_never_absorbs()
    {
        Assert.DoesNotContain(Direction.Stop, LaserReflection.Swivel.Values);
    }

    // Do NOT "fix" a failure here by flipping the lookup — it would be flipping the bug back in.
    // A beam travelling Up into a Mirror.NE enters through the piece's south (Down) face, which
    // is blank: Mirror[(Opposite(Up), NE)] == Mirror[(Down, NE)] == Stop (absorbed).
    // Keying by the raw travel direction would read Mirror[(Up, NE)] == Right and reflect instead.
    [Fact]
    public void Table_key_is_the_entry_side_not_the_travel_direction()
    {
        Assert.Equal(Direction.Stop, LaserReflection.Mirror[(GameEngine.Opposite(Direction.Up), Orientation.NE)]);
        Assert.Equal(Direction.Right, LaserReflection.Mirror[(Direction.Up, Orientation.NE)]); // the wrong-frame answer
    }

    [Fact]
    public void Laser_walk_absorbs_an_up_beam_on_a_mirror_NE_blank_face()
    {
        // Single Mirror.NE in column 9; P1's laser climbs column 9 heading Up.
        var target = new Coord(4, 9);
        var board = TestBoard.With((target, TestBoard.Mirror(Orientation.NE, Player.P2)));

        var (after, outcome) = GameEngine.FireLaser(board, Player.P1);

        Assert.Equal(LaserTermination.Absorbed, outcome.Termination);
        Assert.Contains(target, outcome.Eliminated);
        Assert.Null(after.PieceAt(target));
        // Wrong-frame walk would reflect East off the board: ExitedBoard, mirror intact.
    }
}
