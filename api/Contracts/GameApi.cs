namespace Khet.Api.Contracts;

/// <summary>
/// Returned by <c>POST /api/games</c> and <c>GET /api/games/{id}</c>. <see cref="Rated"/> mirrors
/// <see cref="Domain.Game.Rated"/>. <see cref="P1Claimed"/>/<see cref="P2Claimed"/> say whether an
/// account is attached to that seat — not who, so a spectator can't read account ids off a room —
/// which is what a client needs to decide whether to offer "claim this seat" after login.
/// <see cref="TimeControl"/>/<see cref="P1RemainingMs"/>/<see cref="P2RemainingMs"/>/
/// <see cref="TurnStartedAtUtc"/>/<see cref="TurnDeadlineUtc"/> mirror the identically-named
/// <see cref="Domain.Game"/> columns — all null for an untimed game.
/// <see cref="ServerNowUtc"/> is always present (even untimed) and is load-bearing, not decoration:
/// the client must never tick a countdown against its own clock (skew is common and untested) — it
/// computes <c>offset = serverNowUtc - Date.now()</c> once per payload and ticks against
/// <c>Date.now() + offset</c> thereafter. <see cref="TimedOut"/> is computed fresh on every read
/// (<c>Status == InProgress &amp;&amp; now &gt; TurnDeadlineUtc</c>), never persisted — gated on
/// <c>InProgress</c> so an already-finished game never reports true regardless of how stale its
/// deadline is. <see cref="EndReason"/> mirrors <see cref="Domain.Game.EndReason"/> (<c>"Pharaoh"</c>
/// or <c>"Timeout"</c>, null while <c>InProgress</c>) — added per owner decision so a plain reload,
/// resync, or late reconnect to an already-finished game can still tell a timeout loss from an
/// ordinary win without depending on having seen the in-move 409/broadcast that originally ended it.
/// </summary>
public sealed record GameResponse(
    Guid Id,
    string Status,
    string CurrentTurn,
    int MoveCount,
    BoardState BoardState,
    string Ruleset,
    string Layout,
    bool Rated,
    bool P1Claimed,
    bool P2Claimed,
    string? TimeControl,
    long? P1RemainingMs,
    long? P2RemainingMs,
    DateTime? TurnStartedAtUtc,
    DateTime? TurnDeadlineUtc,
    DateTime ServerNowUtc,
    bool TimedOut,
    string? EndReason);

/// <summary>
/// Optional body of <c>POST /api/games</c>. <see cref="Ruleset"/>/<see cref="Layout"/> default to
/// <c>"Classic"</c> when null, empty, or the whole body is omitted. <see cref="FirstPlayer"/>
/// ("P1"/"P2") defaults to P1 — used for a rematch that swaps who moves first. An unknown name
/// for any of the three is a 400.
/// </summary>
public sealed record CreateGameRequest(string? Ruleset = null, string? Layout = null, string? FirstPlayer = null);

/// <summary>
/// Optional body of <c>POST /api/rooms</c>. Ruleset/Layout default as <see cref="CreateGameRequest"/>
/// does. <see cref="TimeControl"/> is a preset name (<c>TimeControls.For</c>) or null/omitted for an
/// untimed room — an unknown name is a 400. Room-only: <see cref="CreateGameRequest"/> (local play)
/// does not gain this field, since local/offline play stays clockless.
/// </summary>
public sealed record CreateRoomRequest(string? Ruleset = null, string? Layout = null, string? TimeControl = null);

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

/// <summary>
/// Response to a successful move: the new board, the laser it triggered, and the game state after.
/// Carries the same clock fields as <see cref="GameResponse"/> (minus the computed
/// <see cref="GameResponse.TimedOut"/>) inline — avoids an extra round-trip per move, same reason
/// <see cref="Status"/>/<see cref="CurrentTurn"/> are already inlined here rather than requiring a
/// follow-up <c>GET</c>.
/// </summary>
public sealed record SubmitMoveResponse(
    BoardState BoardState,
    IReadOnlyList<LaserResultSegment> LaserSegments,
    IReadOnlyList<EliminatedPiece> Eliminated,
    IReadOnlyList<DamagedPiece> Damaged,
    string Status,
    string CurrentTurn,
    int MoveNumber,
    string? TimeControl,
    long? P1RemainingMs,
    long? P2RemainingMs,
    DateTime? TurnStartedAtUtc,
    DateTime? TurnDeadlineUtc,
    DateTime ServerNowUtc);

/// <summary>Body of every 4xx from the games API: <c>{ "error": "reason" }</c>.</summary>
public sealed record MoveError(string Error);

/// <summary>
/// Broadcast over SignalR as <c>gameEnded</c> whenever a timeout ends a game — from both
/// <c>GameService.SubmitMoveAsync</c>'s pre-validation check (a submitted move arrived after the
/// mover's clock had already expired; the move itself is never applied) and
/// <c>POST /api/games/{id}/claim-timeout</c>. Deliberately its own event, not an overload of
/// <c>moveApplied</c>: the frontend's <c>applyRemoteMove</c> drops any payload whose move number
/// isn't past what it already has, which is always true here since no move was actually applied.
/// </summary>
public sealed record GameEndedResponse(string Status, string EndReason, DateTime ServerNowUtc);

/// <summary>
/// Body of the 409 <c>POST /api/games/{id}/moves</c> returns when the submitted move arrives after
/// the mover's clock had already expired — the move was never applied, and the game just ended as
/// a side effect of this call. Carries <see cref="Error"/> so it still satisfies <see cref="MoveError"/>'s
/// <c>{ "error": "reason" }</c> contract (every existing 4xx caller already parses that shape)
/// while adding the fields a clock-aware caller wants without a follow-up <c>GET</c>.
/// </summary>
public sealed record MoveTimedOutError(string Error, string Status, string EndReason, DateTime ServerNowUtc);

/// <summary>
/// Returned by <c>POST /api/games/{id}/claim-timeout</c> on a genuine, server-confirmed timeout —
/// 409 (<see cref="MoveError"/> body) instead if <see cref="Domain.Game.TurnDeadlineUtc"/> hasn't
/// actually passed yet, or the game already finished.
/// </summary>
public sealed record ClaimTimeoutResponse(Guid GameId, string Status, string EndReason, DateTime ServerNowUtc);

/// <summary>
/// Body of <c>POST /api/games/{id}/claim-abandonment</c>. <see cref="Seat"/> is the caller's own
/// seat ("P1"/"P2") — "my opponent abandoned, I win" — not the seat that's suspected of
/// disconnecting.
/// </summary>
public sealed record ClaimAbandonmentRequest(string Seat);

/// <summary>
/// Returned by <c>POST /api/games/{id}/claim-abandonment</c> on a genuine, server-confirmed
/// abandonment — 409 (<see cref="MoveError"/> body) instead if the other seat isn't tracked as
/// disconnected, hasn't been long enough yet, or the game already finished. Same shape as
/// <see cref="ClaimTimeoutResponse"/>; <see cref="EndReason"/> is always <c>"Abandonment"</c> here.
/// </summary>
public sealed record ClaimAbandonmentResponse(Guid GameId, string Status, string EndReason, DateTime ServerNowUtc);

/// <summary>
/// One row of <c>GET /api/games</c> — a lightweight summary (no board state) for an archive/list
/// view. <see cref="FinishedAtUtc"/> is null while <see cref="Status"/> is <c>"InProgress"</c>.
/// <see cref="Rated"/> mirrors <see cref="Domain.Game.Rated"/> — whether this game counted toward
/// Elo (only ever true for a finished game; false for anything still in progress).
/// <see cref="EndReason"/> mirrors <see cref="Domain.Game.EndReason"/> (<c>"Pharaoh"</c> or
/// <c>"Timeout"</c>) — null while still <c>InProgress</c>. Without this, a timeout loss is
/// indistinguishable from an ordinary win in the archive list, which is the whole reason the
/// column exists (see <see cref="Domain.Game.EndReason"/>'s doc comment) — added here explicitly
/// per owner decision rather than deferred, since the archive is exactly where that ambiguity bites.
/// </summary>
public sealed record GameSummary(
    Guid Id,
    DateTime CreatedAtUtc,
    DateTime? FinishedAtUtc,
    string Status,
    string Ruleset,
    string Layout,
    int MoveCount,
    bool Rated,
    string? EndReason);

/// <summary>Body of <c>POST /api/games/{id}/claim-seat</c>. <see cref="Seat"/> is "P1" or "P2".</summary>
public sealed record ClaimSeatRequest(string Seat);

/// <summary>
/// Returned by <c>POST /api/games/{id}/claim-seat</c>. <see cref="Claimed"/> is always true on a
/// 200 — the endpoint 400s/409s instead of returning a false value; kept as an explicit field so
/// the shape reads the same as the other action-result responses in this API.
/// </summary>
public sealed record ClaimSeatResponse(Guid GameId, string Seat, bool Claimed);

/// <summary>One row of <c>GET /api/leaderboard</c>, ordered by <see cref="Rating"/> descending.</summary>
public sealed record LeaderboardEntry(Guid UserId, string DisplayName, int Rating, int RatedGamesPlayed);

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
