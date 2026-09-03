namespace Khet.Api.Contracts;

/// <summary>One square the beam crossed. <see cref="Enter"/>/<see cref="Exit"/> are edge names ("Top" etc.); Exit is null where the beam stopped.</summary>
public sealed record LaserResultSegment(int Row, int Col, string Enter, string? Exit);

/// <summary>Where the beam started and which way it was heading ("Up" / "Down").</summary>
public sealed record EmitterInfo(int Row, int Col, string Direction);

/// <summary>A piece the beam removed, with enough detail to replay the game without a per-move snapshot.</summary>
public sealed record EliminatedPiece(int Row, int Col, string Kind, string Owner);

/// <summary>An obelisk the beam hit that survived, with its health afterwards.</summary>
public sealed record DamagedPiece(int Row, int Col, int HealthRemaining);

/// <summary>
/// The full trace of one fired laser. Stored as the <c>Move.LaserResult</c> jsonb column and
/// echoed (in part) in the move response. <see cref="Segments"/> runs emitter → terminus.
/// </summary>
public sealed record LaserResult(
    string FiredBy,
    EmitterInfo Emitter,
    string Termination,
    IReadOnlyList<LaserResultSegment> Segments,
    CoordDto? HitCell,
    IReadOnlyList<EliminatedPiece> Eliminated,
    IReadOnlyList<DamagedPiece> Damaged);
