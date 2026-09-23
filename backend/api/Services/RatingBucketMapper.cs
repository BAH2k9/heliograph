using Heliograph.Api.Domain;
using Heliograph.Clock;
using Heliograph.Contracts;

namespace Heliograph.Api.Services;

/// <summary>
/// The single place an <see cref="ApplicationUser"/>'s five per-category buckets become the wire
/// shape — used by <see cref="AuthService"/>'s own profile mapping, <see cref="AdminService"/>'s
/// user-list row mapping, and the in-game <c>GET /api/games/{id}/players/{seat}</c> endpoint, so the
/// Wins/Losses/TotalGamesPlayed logic lives in exactly one place rather than being duplicated per
/// caller (see <c>backlog/09-player-info-popup.md</c>).
/// </summary>
public static class RatingBucketMapper
{
    /// <summary>Always exactly 5 entries, one per <see cref="TimeControlCategory"/>, in enum declaration order.</summary>
    public static IReadOnlyList<RatingBucket> RatingBucketsFor(ApplicationUser user) =>
        Enum.GetValues<TimeControlCategory>()
            .Select(category =>
            {
                var (rating, gamesPlayed) = user.BucketFor(category);
                var (wins, losses) = user.WinLossFor(category);
                return new RatingBucket(category.ToString(), rating, gamesPlayed, wins, losses);
            })
            .ToList();

    /// <summary>Sum of <c>GamesPlayed</c> across all five buckets — rated games only, matching the existing bucket semantics.</summary>
    public static int TotalGamesPlayedFor(ApplicationUser user) =>
        Enum.GetValues<TimeControlCategory>().Sum(category => user.BucketFor(category).GamesPlayed);
}
