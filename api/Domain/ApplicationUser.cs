using Khet.Clock;
using Microsoft.AspNetCore.Identity;

namespace Khet.Api.Domain;

/// <summary>
/// An account. Identity owns <c>UserName</c>/<c>Email</c>/<c>PasswordHash</c>; everything below is
/// this app's own. <see cref="DisplayName"/> is the public-facing identity (rooms, leaderboard) —
/// deliberately separate from <c>UserName</c>/<c>Email</c> so it can change without touching login
/// credentials.
///
/// Rating is split by <see cref="TimeControlCategory"/> — Bullet/Blitz/Rapid/Daily each get their
/// own Rating+GamesPlayed pair, as explicit additive columns rather than a normalized child table
/// (a small fixed set of variants — matches <c>Game.P1RemainingMs</c>/<c>P2RemainingMs</c> and the
/// <c>AddTimeControls</c> migration's own reasoning). Every account starts each bucket at 1200/0,
/// and a bucket only moves via <c>EloService</c>, when a rated game finishes with a known
/// <c>Game.TimeControl</c> in that category — an untimed rated game updates no bucket at all (see
/// <c>GameService.ApplyEloAsync</c>).
/// </summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = default!;

    /// <summary>
    /// One of <see cref="AvatarCatalog.Names"/>, or null — null means "no avatar picked yet",
    /// rendered by the frontend as today's initial-letter fallback. Not defaulted to a preset id:
    /// null carries meaning here (see <c>CLAUDE.md</c>'s "null carries meaning" convention), same as
    /// <see cref="Game.TimeControl"/>.
    /// </summary>
    public string? AvatarId { get; set; }

    public int BulletRating { get; set; } = 1200;
    public int BulletGamesPlayed { get; set; }

    public int BlitzRating { get; set; } = 1200;
    public int BlitzGamesPlayed { get; set; }

    public int RapidRating { get; set; } = 1200;
    public int RapidGamesPlayed { get; set; }

    public int DailyRating { get; set; } = 1200;
    public int DailyGamesPlayed { get; set; }

    /// <summary>Reads the Rating+GamesPlayed pair for one category.</summary>
    public (int Rating, int GamesPlayed) BucketFor(TimeControlCategory category) => category switch
    {
        TimeControlCategory.Bullet => (BulletRating, BulletGamesPlayed),
        TimeControlCategory.Blitz => (BlitzRating, BlitzGamesPlayed),
        TimeControlCategory.Rapid => (RapidRating, RapidGamesPlayed),
        TimeControlCategory.Daily => (DailyRating, DailyGamesPlayed),
        _ => throw new ArgumentOutOfRangeException(nameof(category)),
    };

    /// <summary>Overwrites the Rating+GamesPlayed pair for one category.</summary>
    public void SetBucket(TimeControlCategory category, int rating, int gamesPlayed)
    {
        switch (category)
        {
            case TimeControlCategory.Bullet: BulletRating = rating; BulletGamesPlayed = gamesPlayed; break;
            case TimeControlCategory.Blitz: BlitzRating = rating; BlitzGamesPlayed = gamesPlayed; break;
            case TimeControlCategory.Rapid: RapidRating = rating; RapidGamesPlayed = gamesPlayed; break;
            case TimeControlCategory.Daily: DailyRating = rating; DailyGamesPlayed = gamesPlayed; break;
            default: throw new ArgumentOutOfRangeException(nameof(category));
        }
    }
}
