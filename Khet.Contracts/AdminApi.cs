namespace Khet.Contracts;

/// <summary>
/// Body of every 4xx from the admin API: <c>{ "error": "reason" }</c> — same shape as
/// <see cref="AuthError"/> / <see cref="MoveError"/>, kept as its own type so the area is greppable.
/// </summary>
public sealed record AdminError(string Error);

/// <summary>
/// One row of <c>GET /api/admin/users</c>. <see cref="Ratings"/> is the same 4-bucket shape as
/// <see cref="UserProfile.Ratings"/>. <see cref="ActiveSessionCount"/> is how many of this account's
/// refresh tokens are currently un-revoked and unexpired — i.e. how many live sessions a
/// "revoke sessions" action would kill. <see cref="CreatedAtUtc"/> mirrors
/// <c>Khet.Api.Domain.ApplicationUser.CreatedAtUtc</c> and is the list's default sort key (newest first).
/// </summary>
public sealed record AdminUserRow(
    Guid Id,
    string Email,
    string DisplayName,
    bool IsAdmin,
    bool IsDisabled,
    DateTime CreatedAtUtc,
    IReadOnlyList<RatingBucket> Ratings,
    int ActiveSessionCount);

/// <summary>
/// Body of <c>GET /api/admin/users</c> — one page of <see cref="AdminUserRow"/> plus the unpaged
/// <see cref="Total"/> so the client can render "page X of Y". <see cref="Page"/> is 1-based.
/// </summary>
public sealed record AdminUserListResponse(
    IReadOnlyList<AdminUserRow> Users,
    int Total,
    int Page,
    int PageSize);

/// <summary>
/// Body of <c>POST /api/admin/users</c>. Same validation as <c>POST /api/auth/register</c>
/// (display name 1-32 chars, password per the Identity policy) — 409 on a duplicate email, 400
/// otherwise. <see cref="IsAdmin"/> lets an admin mint another admin directly.
/// </summary>
public sealed record AdminCreateUserRequest(string Email, string Password, string DisplayName, bool IsAdmin);

/// <summary>
/// Body of <c>PATCH /api/admin/users/{id}</c>. Every field optional; a null/omitted field leaves
/// that part unchanged. <see cref="DisplayName"/>, if given, must be 1-32 chars after trimming (400).
/// Clearing your own <see cref="IsAdmin"/>, or the last remaining admin's, is refused (400).
/// Setting <see cref="IsDisabled"/> true (or removing admin) also revokes that account's live
/// sessions.
/// </summary>
public sealed record AdminPatchUserRequest(string? DisplayName = null, bool? IsAdmin = null, bool? IsDisabled = null);

/// <summary>
/// Body of <c>POST /api/admin/users/{id}/password</c>. The new password must satisfy the same
/// Identity policy as registration (400 otherwise). On success the target's live sessions are
/// revoked, so an existing login can't outlive the reset.
/// </summary>
public sealed record AdminSetPasswordRequest(string NewPassword);

/// <summary>
/// Body of <c>POST /api/admin/users/{id}/rating</c>. <see cref="Category"/> is one of the
/// <c>Khet.Clock.TimeControlCategory</c> names ("Bullet"/"Blitz"/"Rapid"/"Daily"), 400 otherwise.
/// <see cref="GamesPlayed"/> is optional — omit it to overwrite only the rating and leave the
/// games-played count as it was.
/// </summary>
public sealed record AdminSetRatingRequest(string Category, int Rating, int? GamesPlayed = null);

/// <summary>Body of <c>POST /api/admin/users/{id}/revoke-sessions</c> response.</summary>
public sealed record AdminRevokeSessionsResponse(int Revoked);

/// <summary>
/// One row of <c>GET /api/admin/games</c>. String-typed <see cref="Status"/> /
/// <see cref="EndReason"/> mirror the persisted <c>Khet.Api.Domain.Game</c> columns (Contracts is
/// BCL-only and can't see <c>Khet.Engine</c>'s enums). <see cref="P1DisplayName"/> /
/// <see cref="P2DisplayName"/> are resolved from the seat's account, null for an anonymous/empty
/// seat. <see cref="JoinCode"/> non-null means this game is a room.
/// </summary>
public sealed record AdminGameRow(
    Guid Id,
    string Status,
    string? EndReason,
    string Ruleset,
    string Layout,
    string? TimeControl,
    bool Rated,
    int MoveCount,
    int SeatsTaken,
    string? JoinCode,
    Guid? P1UserId,
    string? P1DisplayName,
    Guid? P2UserId,
    string? P2DisplayName,
    DateTime CreatedAtUtc,
    DateTime? FinishedAtUtc);

/// <summary>Body of <c>GET /api/admin/games</c>. <see cref="Page"/> is 1-based; see <see cref="AdminUserListResponse"/>.</summary>
public sealed record AdminGameListResponse(
    IReadOnlyList<AdminGameRow> Games,
    int Total,
    int Page,
    int PageSize);

/// <summary>
/// Body of <c>POST /api/admin/games/{id}/force-end</c>. <see cref="Winner"/> is "P1" or "P2" (400
/// otherwise) — the seat recorded as the winner. The game must be <c>InProgress</c> (409 otherwise).
/// <c>Khet.Api.Domain.Game.EndReason</c> is set to <c>"Aborted"</c> and, unlike every organic
/// ending, Elo is deliberately NOT applied (owner decision — an admin intervention doesn't move
/// ratings). Broadcast to the game's group as <c>gameEnded</c> (<see cref="GameEndedResponse"/>),
/// same as a resignation.
/// </summary>
public sealed record AdminForceEndRequest(string Winner);

/// <summary>
/// Body of <c>POST /api/admin/rooms/cleanup</c>. Deletes every <c>InProgress</c> game that is a room
/// (<see cref="AdminGameRow.JoinCode"/> non-null), has fewer than two seats taken, and was created
/// more than <see cref="OlderThanHours"/> hours ago — the "created a room, nobody ever joined,
/// abandoned forever" shape that nothing else cleans up.
/// </summary>
public sealed record AdminRoomCleanupRequest(int OlderThanHours);

/// <summary>Response to <c>POST /api/admin/rooms/cleanup</c> — how many stale rooms were removed.</summary>
public sealed record AdminRoomCleanupResponse(int DeletedCount);

/// <summary>
/// Body of <c>GET /api/admin/stats</c> — a handful of counts for the admin dashboard.
/// <see cref="GamesFinished"/> is all-time finished games; <see cref="OpenRooms"/> is
/// <c>InProgress</c> rooms with a free seat.
/// </summary>
public sealed record AdminStats(
    int TotalUsers,
    int AdminCount,
    int DisabledCount,
    int GamesInProgress,
    int GamesFinished,
    int OpenRooms,
    int RatedGames);
