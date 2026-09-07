using Khet.Engine.Enums;

namespace Khet.Engine;

/// <summary>
/// Ported from KhetV3/MVVM/Models/LaserReflection.cs (the old WPF repo).
///
/// The key <see cref="Direction"/> is the side of the square the beam ENTERS through, i.e.
/// <c>GameEngine.Opposite(travelDirection)</c> — NOT the direction the beam is travelling.
/// The value is the new travel direction, used as-is (<see cref="Direction.Stop"/> means the
/// piece absorbs the beam on that face and is destroyed). KhetV3's consumer applies the same
/// flip (<c>DirectionMappings.flip</c>) before indexing these tables.
/// </summary>
internal static class LaserReflection
{
    public static readonly Dictionary<(Direction, Orientation), Direction> Djed = new()
    {
        { (Direction.Up, Orientation.NW), Direction.Left },
        { (Direction.Up, Orientation.NE), Direction.Right },
        { (Direction.Up, Orientation.SE), Direction.Left },
        { (Direction.Up, Orientation.SW), Direction.Right },

        { (Direction.Down, Orientation.NW), Direction.Right },
        { (Direction.Down, Orientation.NE), Direction.Left },
        { (Direction.Down, Orientation.SE), Direction.Right },
        { (Direction.Down, Orientation.SW), Direction.Left },

        { (Direction.Left, Orientation.NW), Direction.Up },
        { (Direction.Left, Orientation.NE), Direction.Down },
        { (Direction.Left, Orientation.SE), Direction.Up },
        { (Direction.Left, Orientation.SW), Direction.Down },

        { (Direction.Right, Orientation.NW), Direction.Down },
        { (Direction.Right, Orientation.NE), Direction.Up },
        { (Direction.Right, Orientation.SE), Direction.Down },
        { (Direction.Right, Orientation.SW), Direction.Up }
    };

    public static readonly Dictionary<(Direction, Orientation), Direction> Pyramid = new()
    {
        { (Direction.Up, Orientation.NW), Direction.Left },
        { (Direction.Up, Orientation.NE), Direction.Right },
        { (Direction.Up, Orientation.SE), Direction.Stop },
        { (Direction.Up, Orientation.SW), Direction.Stop },

        { (Direction.Down, Orientation.NW), Direction.Stop },
        { (Direction.Down, Orientation.NE), Direction.Stop },
        { (Direction.Down, Orientation.SE), Direction.Right },
        { (Direction.Down, Orientation.SW), Direction.Left },

        { (Direction.Left, Orientation.NW), Direction.Up },
        { (Direction.Left, Orientation.NE), Direction.Stop },
        { (Direction.Left, Orientation.SE), Direction.Stop },
        { (Direction.Left, Orientation.SW), Direction.Down },

        { (Direction.Right, Orientation.NW), Direction.Stop },
        { (Direction.Right, Orientation.NE), Direction.Up },
        { (Direction.Right, Orientation.SE), Direction.Down },
        { (Direction.Right, Orientation.SW), Direction.Stop }
    };
}
