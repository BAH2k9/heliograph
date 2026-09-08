using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Clock;
using Khet.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Services;

public sealed class LeaderboardService(KhetDbContext db)
{
    public const int DefaultTop = 50;
    public const int MaxTop = 200;

    /// <summary>
    /// Rating-descending within one <see cref="TimeControlCategory"/> bucket, only accounts with
    /// at least one rated game in that category (keeps fresh 1200-default accounts, which haven't
    /// proven anything in this category, off the board). <paramref name="top"/> is clamped to
    /// [1, <see cref="MaxTop"/>].
    /// </summary>
    public async Task<List<LeaderboardEntry>> GetTopAsync(TimeControlCategory category, int top, CancellationToken ct = default)
    {
        var take = Math.Clamp(top, 1, MaxTop);
        return category switch
        {
            TimeControlCategory.Bullet => await db.Users.AsNoTracking()
                .Where(u => u.BulletGamesPlayed > 0)
                .OrderByDescending(u => u.BulletRating).ThenByDescending(u => u.BulletGamesPlayed).ThenBy(u => u.DisplayName)
                .Take(take)
                .Select(u => new LeaderboardEntry(u.Id, u.DisplayName, u.BulletRating, u.BulletGamesPlayed))
                .ToListAsync(ct),
            TimeControlCategory.Blitz => await db.Users.AsNoTracking()
                .Where(u => u.BlitzGamesPlayed > 0)
                .OrderByDescending(u => u.BlitzRating).ThenByDescending(u => u.BlitzGamesPlayed).ThenBy(u => u.DisplayName)
                .Take(take)
                .Select(u => new LeaderboardEntry(u.Id, u.DisplayName, u.BlitzRating, u.BlitzGamesPlayed))
                .ToListAsync(ct),
            TimeControlCategory.Rapid => await db.Users.AsNoTracking()
                .Where(u => u.RapidGamesPlayed > 0)
                .OrderByDescending(u => u.RapidRating).ThenByDescending(u => u.RapidGamesPlayed).ThenBy(u => u.DisplayName)
                .Take(take)
                .Select(u => new LeaderboardEntry(u.Id, u.DisplayName, u.RapidRating, u.RapidGamesPlayed))
                .ToListAsync(ct),
            TimeControlCategory.Daily => await db.Users.AsNoTracking()
                .Where(u => u.DailyGamesPlayed > 0)
                .OrderByDescending(u => u.DailyRating).ThenByDescending(u => u.DailyGamesPlayed).ThenBy(u => u.DisplayName)
                .Take(take)
                .Select(u => new LeaderboardEntry(u.Id, u.DisplayName, u.DailyRating, u.DailyGamesPlayed))
                .ToListAsync(ct),
            _ => throw new ArgumentOutOfRangeException(nameof(category)),
        };
    }
}
