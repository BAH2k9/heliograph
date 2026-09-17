namespace Khet.Api.Domain;

/// <summary>
/// A player-filed bug report: a snapshot of one client's view of a game at the moment they hit
/// "Report a bug", stored verbatim for manual diagnosis (see <c>backlog/10-bug-traceability.md</c>).
/// Append-only, admin-readable/deletable only (<c>AdminController</c>'s <c>/api/admin/bug-reports*</c>
/// routes) — no automatic retention/pruning (owner decision: manual cleanup only, matching this
/// repo's no-background-worker convention).
/// </summary>
public class BugReport
{
    public Guid Id { get; set; }

    /// <summary>
    /// The game this report was filed against, or null if the game has since been deleted
    /// (<see cref="Data.KhetDbContext"/>'s <c>SetNull</c> FK behavior) — the report itself is the
    /// diagnostic record and must outlive the game it describes.
    /// </summary>
    public Guid? GameId { get; set; }

    /// <summary>The signed-in account that filed this report, or null if that account has since been deleted.</summary>
    public Guid? UserId { get; set; }

    /// <summary>The caller's own seat at the moment of filing: <c>"P1"</c>/<c>"P2"</c>/<c>"Spectator"</c>/null.</summary>
    public string? Seat { get; set; }

    /// <summary>The caller's current SignalR connection id at the moment of filing, or null if the hub wasn't connected.</summary>
    public string? ConnectionId { get; set; }

    public int MoveCount { get; set; }

    public string? Turn { get; set; }

    public string? Status { get; set; }

    public long? ServerOffsetMs { get; set; }

    /// <summary>The <c>TraceId</c> of the last move/ending this client observed (<c>Khet.Contracts.BugReportRequest.LastTraceId</c>).</summary>
    public string? LastTraceId { get; set; }

    public DateTime ClientCapturedAtUtc { get; set; }

    public DateTime ReceivedAtUtc { get; set; }

    /// <summary>
    /// The client's ring buffer + last <c>moveApplied</c> payload, stored as raw JSON text
    /// (<c>request.Bundle.GetRawText()</c>). Deliberately a plain <c>string</c>/jsonb column rather
    /// than a typed <c>Khet.Contracts</c> shape with a <c>JsonbConverter&lt;T&gt;</c> — unlike
    /// <see cref="Game.State"/>/<see cref="Move.LaserResult"/>, nothing ever deserializes this back
    /// into a domain type, and typing it would make every ring-buffer field addition on the
    /// frontend touch <c>Khet.Contracts</c> for no benefit (owner decision).
    /// </summary>
    public string BundleJson { get; set; } = default!;
}
