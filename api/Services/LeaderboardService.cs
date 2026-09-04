using Khet.Api.Contracts;
using Khet.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Services;

public sealed class LeaderboardService(KhetDbContext db)
{
    public const int DefaultTop = 50;
    public const int MaxTop = 200;

    /// <summary>
    /// Rating-descending, only accounts with at least one rated game — keeps fresh 1200-default
    /// accounts (which haven't proven anything) off the board. <paramref name="top"/> is clamped
    /// to [1, <see cref="MaxTop"/>].
    /// </summary>
    public async Task<List<LeaderboardEntry>> GetTopAsync(int top, CancellationToken ct = default)
    {
        var take = Math.Clamp(top, 1, MaxTop);
        return await db.Users
            .AsNoTracking()
            .Where(u => u.RatedGamesPlayed > 0)
            .OrderByDescending(u => u.Rating)
            .ThenByDescending(u => u.RatedGamesPlayed)
            .ThenBy(u => u.DisplayName)
            .Take(take)
            .Select(u => new LeaderboardEntry(u.Id, u.DisplayName, u.Rating, u.RatedGamesPlayed))
            .ToListAsync(ct);
    }
}
