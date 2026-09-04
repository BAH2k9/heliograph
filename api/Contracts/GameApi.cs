namespace Khet.Api.Contracts;

/// <summary>Returned by <c>POST /api/games</c> and <c>GET /api/games/{id}</c>.</summary>
public sealed record GameResponse(
    Guid Id,
    string Status,
    string CurrentTurn,
    int MoveCount,
    BoardState BoardState,
    string Ruleset,
    string Layout);

/// <summary>
/// Optional body of <c>POST /api/games</c>. Both fields default to <c>"Classic"</c> when null,
/// empty, or the whole body is omitted. An unknown name is a 400.
/// </summary>
public sealed record CreateGameRequest(string? Ruleset = null, string? Layout = null);

/// <summary>Optional body of <c>POST /api/rooms</c>. Same defaulting as <see cref="CreateGameRequest"/>.</summary>
public sealed record CreateRoomRequest(string? Ruleset = null, string? Layout = null);

/// <summary>
/// Body of <c>POST /api/games/{id}/moves</c>. <see cref="Type"/> is "move", "rotate", "stack" or
/// "unstack". <see cref="To"/> is required for every type except a rotate (the adjacent obelisk for
/// a stack, the adjacent empty square for an unstack); <see cref="Rotation"/> ("CW"/"CCW") for a
/// rotate. <see cref="Seat"/> ("P1"/"P2"/"Spectator") is the room seat the caller holds; when
/// supplied for a room game it is enforced against whose turn it is, otherwise it is ignored.
/// </summary>
public sealed record SubmitMoveRequest(
    string Type,
    CoordDto From,
    CoordDto? To,
    string? Rotation,
    string? Seat = null);

/// <summary>Returned by <c>POST /api/rooms</c> and <c>POST /api/rooms/{code}/join</c>.</summary>
public sealed record RoomResponse(Guid GameId, string Code, string Seat);

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
