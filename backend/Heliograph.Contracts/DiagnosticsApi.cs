using System.Text.Json;

namespace Heliograph.Contracts;

/// <summary>
/// Body of <c>POST /api/games/{id}/bug-reports</c>. <see cref="Seat"/> is <c>"P1"</c>/<c>"P2"</c>/
/// <c>"Spectator"</c>/null; <see cref="ConnectionId"/> is the caller's current SignalR connection id,
/// null if the hub isn't connected. <see cref="LastTraceId"/> is the <c>TraceId</c> of the last
/// move/ending this client observed (see <see cref="SubmitMoveResponse.TraceId"/>/
/// <see cref="GameEndedResponse.TraceId"/>) — the client's own half of the correlation, not
/// generated here. <see cref="Bundle"/> is opaque: the client's ring buffer plus its last
/// <c>moveApplied</c> payload, stored verbatim and never deserialized back into a domain type (see
/// <c>Heliograph.Api.Domain.BugReport</c>'s doc comment for why).
/// </summary>
public sealed record BugReportRequest(
    string? Seat,
    string? ConnectionId,
    int MoveCount,
    string? Turn,
    string? Status,
    long? ServerOffsetMs,
    string? LastTraceId,
    DateTime ClientCapturedAtUtc,
    JsonElement Bundle);

/// <summary>Returned by <c>POST /api/games/{id}/bug-reports</c> on success (201).</summary>
public sealed record BugReportAck(Guid Id, DateTime ReceivedAtUtc);

/// <summary>
/// One row of <c>GET /api/admin/bug-reports</c> — a summary (no <c>Bundle</c>, no
/// <c>ConnectionId</c>/<c>Turn</c>/<c>Status</c>/<c>ServerOffsetMs</c>/<c>LastTraceId</c>) for a list
/// view; fetch <see cref="AdminBugReportDetail"/> for the rest.
/// </summary>
public sealed record AdminBugReportRow(
    Guid Id,
    Guid? GameId,
    Guid? UserId,
    string? UserDisplayName,
    string? Seat,
    int MoveCount,
    DateTime ClientCapturedAtUtc,
    DateTime ReceivedAtUtc);

/// <summary>
/// Returned by <c>GET /api/admin/bug-reports</c>, same paginated-list shape as
/// <c>Heliograph.Api.Services.AdminService.ListGamesAsync</c>'s response.
/// </summary>
public sealed record AdminBugReportListResponse(IReadOnlyList<AdminBugReportRow> Reports, int Total, int Page, int PageSize);

/// <summary>Returned by <c>GET /api/admin/bug-reports/{id}</c> — every field, including the raw <see cref="Bundle"/>.</summary>
public sealed record AdminBugReportDetail(
    Guid Id,
    Guid? GameId,
    Guid? UserId,
    string? UserDisplayName,
    string? Seat,
    int MoveCount,
    DateTime ClientCapturedAtUtc,
    DateTime ReceivedAtUtc,
    string? ConnectionId,
    string? Turn,
    string? Status,
    long? ServerOffsetMs,
    string? LastTraceId,
    JsonElement Bundle);
