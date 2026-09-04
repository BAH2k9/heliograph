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
/// Optional body of <c>POST /api/games</c>. <see cref="Ruleset"/>/<see cref="Layout"/> default to
/// <c>"Classic"</c> when null, empty, or the whole body is omitted. <see cref="FirstPlayer"/>
/// ("P1"/"P2") defaults to P1 — used for a rematch that swaps who moves first. An unknown name
/// for any of the three is a 400.
/// </summary>
public sealed record CreateGameRequest(string? Ruleset = null, string? Layout = null, string? FirstPlayer = null);

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

/// <summary>
/// One row of <c>GET /api/games</c> — a lightweight summary (no board state) for an archive/list
/// view. <see cref="FinishedAtUtc"/> is null while <see cref="Status"/> is <c>"InProgress"</c>.
/// </summary>
public sealed record GameSummary(
    Guid Id,
    DateTime CreatedAtUtc,
    DateTime? FinishedAtUtc,
    string Status,
    string Ruleset,
    string Layout,
    int MoveCount);

/// <summary>
/// One entry in a game's move history, returned by <c>GET /api/games/{id}/moves</c> in
/// <see cref="Domain.Move.MoveNumber"/> order. <see cref="Type"/>/<see cref="Rotation"/> mirror
/// <see cref="SubmitMoveRequest"/>; <see cref="LaserResult"/> is the full trace stored at the time
/// the move was played. <see cref="BoardState"/> is not persisted — it's recomputed on every read
/// by replaying stored moves through the real engine from the game's starting layout, so it can
/// never drift from the actual rules; it's the board exactly as it stood right after this move's
/// laser fired (same moment <c>Game.State</c> was overwritten to, at the time).
/// </summary>
public sealed record MoveHistoryItem(
    int MoveNumber,
    string Player,
    string Type,
    CoordDto From,
    CoordDto? To,
    string? Rotation,
    LaserResult LaserResult,
    BoardState BoardState,
    DateTime CreatedAtUtc);

/// <summary>
/// Body of <c>GET /api/games/{id}/moves</c>. <see cref="StartingBoardState"/> is the game's
/// starting layout (<c>BoardLayouts.For(game.Layout)</c>) — the "move 0" position a replay
/// scrubber's leftmost step needs, before any move in <see cref="Moves"/> has been applied.
/// </summary>
public sealed record MoveHistoryResponse(BoardState StartingBoardState, IReadOnlyList<MoveHistoryItem> Moves);
