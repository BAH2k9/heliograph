using Heliograph.Api.Domain;
using Heliograph.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Heliograph.Api.Services;

// Bug-report capture (backlog/10-bug-traceability.md). Its own partial file, per the existing
// per-cluster split — this is a standalone concern (write-and-store only, never broadcast, never
// mutates a Game) rather than a natural fit for any existing cluster.
public sealed partial class GameService
{
    /// <summary>Whether a game with this id exists at all — <see cref="Controllers.GamesController.ReportBug"/>'s 404 check.</summary>
    public Task<bool> GameExistsAsync(Guid id, CancellationToken ct = default) =>
        db.Games.AsNoTracking().AnyAsync(g => g.Id == id, ct);

    /// <summary>
    /// Persists one client-filed bug report verbatim. <paramref name="gameId"/> is the route's
    /// authoritative id — never taken from the body. <paramref name="userId"/> is the caller's
    /// account (the endpoint requires auth, so this is never null in practice, but the column stays
    /// nullable so the row survives that account being deleted later — see
    /// <see cref="BugReport.UserId"/>). Does not check <see cref="GameExistsAsync"/> itself — the
    /// controller already did, so the 404 path never reaches here.
    /// </summary>
    public async Task<BugReportAck> SaveBugReportAsync(Guid gameId, Guid? userId, BugReportRequest request, CancellationToken ct = default)
    {
        var now = Now();
        var report = new BugReport
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            UserId = userId,
            Seat = request.Seat,
            ConnectionId = request.ConnectionId,
            MoveCount = request.MoveCount,
            Turn = request.Turn,
            Status = request.Status,
            ServerOffsetMs = request.ServerOffsetMs,
            LastTraceId = request.LastTraceId,
            ClientCapturedAtUtc = request.ClientCapturedAtUtc,
            ReceivedAtUtc = now,
            BundleJson = request.Bundle.GetRawText(),
        };

        db.BugReports.Add(report);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("bug report {BugReportId} filed for game {GameId}, seat {Seat}, move {MoveCount}",
            report.Id, gameId, request.Seat, request.MoveCount);

        return new BugReportAck(report.Id, now);
    }
}
