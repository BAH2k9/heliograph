namespace Khet.Api.Contracts;

/// <summary>Returned by <c>POST /api/games</c> and <c>GET /api/games/{id}</c>.</summary>
public sealed record GameResponse(
    Guid Id,
    string Status,
    string CurrentTurn,
    int MoveCount,
    BoardState BoardState);

/// <summary>
/// Body of <c>POST /api/games/{id}/moves</c>. <see cref="Type"/> is "move" or "rotate".
/// <see cref="To"/> is required for a move; <see cref="Rotation"/> ("CW"/"CCW") for a rotate.
/// </summary>
public sealed record SubmitMoveRequest(string Type, CoordDto From, CoordDto? To, string? Rotation);

/// <summary>Response to a successful move: the new board, the laser it triggered, and the game state after.</summary>
public sealed record SubmitMoveResponse(
    BoardState BoardState,
    IReadOnlyList<LaserResultSegment> LaserSegments,
    IReadOnlyList<EliminatedPiece> Eliminated,
    IReadOnlyList<DamagedPiece> Damaged,
    string Status,
    string CurrentTurn,
    int MoveNumber);

/// <summary>Body of every 4xx from the games API: <c>{ "error": "reason" }</c>.</summary>
public sealed record MoveError(string Error);
