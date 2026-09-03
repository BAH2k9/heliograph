using Khet.Api.Domain.Enums;

namespace Khet.Api.Engine;

/// <summary>
/// One square the beam passed through. <see cref="Enter"/> is the edge it came in by;
/// <see cref="Exit"/> is the edge it left by, or null if the beam stopped in this square.
/// </summary>
public sealed record LaserSegment(int Row, int Col, LaserEdge Enter, LaserEdge? Exit);

/// <summary>
/// The full result of firing one laser. <see cref="Segments"/> is ordered from the emitter
/// to where the beam ended. <see cref="Eliminated"/> and <see cref="Damaged"/> are always
/// present (possibly empty). <see cref="HitCell"/> is the terminal square, or null if the
/// beam left the board.
/// </summary>
public sealed record LaserOutcome(
    IReadOnlyList<LaserSegment> Segments,
    IReadOnlyList<Coord> Eliminated,
    IReadOnlyList<LaserDamage> Damaged,
    LaserTermination Termination,
    Coord? HitCell);

/// <summary>An obelisk that took a hit but survived, with its health after the hit.</summary>
public sealed record LaserDamage(Coord Cell, int HealthRemaining);
