using Heliograph.Engine.Enums;

namespace Heliograph.Engine;

/// <summary>
/// One player action. For <see cref="MoveKind.Move"/>, <paramref name="To"/> is set
/// (an adjacent square, possibly a Swivel swap). For <see cref="MoveKind.Rotate"/>,
/// <paramref name="Rotation"/> is set and the piece turns 90° in place. For
/// <see cref="MoveKind.Stack"/> / <see cref="MoveKind.Unstack"/>, <paramref name="To"/> is
/// the adjacent bastion / empty square the second bastion merges into or splits onto.
/// </summary>
public readonly record struct EngineMove(MoveKind Kind, Coord From, Coord? To, RotationDir? Rotation)
{
    public static EngineMove Shift(Coord from, Coord to) => new(MoveKind.Move, from, to, null);

    public static EngineMove Turn(Coord from, RotationDir rotation) =>
        new(MoveKind.Rotate, from, null, rotation);

    public static EngineMove Stack(Coord from, Coord to) => new(MoveKind.Stack, from, to, null);

    public static EngineMove Unstack(Coord from, Coord to) => new(MoveKind.Unstack, from, to, null);
}
