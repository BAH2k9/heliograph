using Khet.Api.Domain.Enums;

namespace Khet.Api.Engine;

/// <summary>
/// One player action. For <see cref="MoveKind.Move"/>, <paramref name="To"/> is set
/// (an adjacent square, possibly a Djed swap). For <see cref="MoveKind.Rotate"/>,
/// <paramref name="Rotation"/> is set and the piece turns 90° in place.
/// </summary>
public readonly record struct EngineMove(MoveKind Kind, Coord From, Coord? To, RotationDir? Rotation)
{
    public static EngineMove Shift(Coord from, Coord to) => new(MoveKind.Move, from, to, null);

    public static EngineMove Turn(Coord from, RotationDir rotation) =>
        new(MoveKind.Rotate, from, null, rotation);
}
