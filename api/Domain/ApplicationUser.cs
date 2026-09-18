using Khet.Clock;
using Microsoft.AspNetCore.Identity;

namespace Khet.Api.Domain;

/// <summary>
/// An account. Identity owns <c>UserName</c>/<c>Email</c>/<c>PasswordHash</c>; everything below is
/// this app's own. <see cref="DisplayName"/> is the public-facing identity (rooms, leaderboard) —
/// deliberately separate from <c>UserName</c>/<c>Email</c> so it can change without touching login
/// credentials.
///
/// Rating is split by <see cref="TimeControlCategory"/> — Bullet/Blitz/Rapid/Daily/Untimed each
/// get their own Rating+GamesPlayed pair, as explicit additive columns rather than a normalized
/// child table (a small fixed set of variants — matches <c>Game.P1RemainingMs</c>/<c>P2RemainingMs</c>
/// and the <c>AddTimeControls</c> migration's own reasoning). Every account starts each bucket at
/// 1200/0, and a bucket only moves via <c>EloService</c>, when a rated game finishes — the
/// <c>Untimed</c> bucket moves for a rated game with no <c>Game.TimeControl</c>, exactly like the
/// other four move for their own category (see <c>GameEndService.ApplyEloAsync</c>).
///
/// <see cref="IsAdmin"/> / <see cref="IsDisabled"/> are the two flags the <c>/api/admin</c> surface
/// reads and writes: admin gates that controller (and rides into the access-token as an
/// <c>is_admin</c> claim — see <c>JwtTokenService.CreateAccessToken</c>), disabled blocks login and
/// refresh (see <c>AuthService</c>). Both default false; the first admin is bootstrapped from
/// <c>AdminOptions.BootstrapEmail</c> at startup.
/// </summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = default!;

    /// <summary>
    /// A fixed-width 4-digit zero-padded string (e.g. <c>"0007"</c>), assigned randomly at account
    /// creation and re-rolled on a unique-index collision — same shape as <c>RoomService.NewCode()</c>'s
    /// join-code retry. Uniqueness is only enforced on the pair <c>(DisplayName, Discriminator)</c>,
    /// not globally (see the unique index in <c>KhetDbContext</c>), same as Discord: two accounts
    /// with different display names can share a discriminator, only a same-display-name collision
    /// needs a re-roll. <see cref="DisplayName"/> alone stays the identity shown in-game/leaderboard/
    /// profile; this only ever appears alongside it (rendered as <c>DisplayName#nnnn</c>) in
    /// friend-search/friend-list contexts (<c>FriendService</c>, <c>UsersController</c>).
    /// </summary>
    public string Discriminator { get; set; } = default!;

    /// <summary>Grants access to the <c>/api/admin</c> API. Managed by other admins once bootstrapped.</summary>
    public bool IsAdmin { get; set; }

    /// <summary>A disabled account can't log in or refresh — see <c>AuthService.LoginAsync</c>/<c>RefreshAsync</c>.</summary>
    public bool IsDisabled { get; set; }

    /// <summary>When the account was registered — the admin user list's default sort key.</summary>
    public DateTime CreatedAtUtc { get; set; }

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

    public int UntimedRating { get; set; } = 1200;
    public int UntimedGamesPlayed { get; set; }

    public int BulletWins { get; set; }
    public int BulletLosses { get; set; }

    public int BlitzWins { get; set; }
    public int BlitzLosses { get; set; }

    public int RapidWins { get; set; }
    public int RapidLosses { get; set; }

    public int DailyWins { get; set; }
    public int DailyLosses { get; set; }

    public int UntimedWins { get; set; }
    public int UntimedLosses { get; set; }

    /// <summary>Reads the Rating+GamesPlayed pair for one category.</summary>
    public (int Rating, int GamesPlayed) BucketFor(TimeControlCategory category) => category switch
    {
        TimeControlCategory.Bullet => (BulletRating, BulletGamesPlayed),
        TimeControlCategory.Blitz => (BlitzRating, BlitzGamesPlayed),
        TimeControlCategory.Rapid => (RapidRating, RapidGamesPlayed),
        TimeControlCategory.Daily => (DailyRating, DailyGamesPlayed),
        TimeControlCategory.Untimed => (UntimedRating, UntimedGamesPlayed),
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
            case TimeControlCategory.Untimed: UntimedRating = rating; UntimedGamesPlayed = gamesPlayed; break;
            default: throw new ArgumentOutOfRangeException(nameof(category));
        }
    }

    /// <summary>Reads the Wins/Losses pair for one category.</summary>
    public (int Wins, int Losses) WinLossFor(TimeControlCategory category) => category switch
    {
        TimeControlCategory.Bullet => (BulletWins, BulletLosses),
        TimeControlCategory.Blitz => (BlitzWins, BlitzLosses),
        TimeControlCategory.Rapid => (RapidWins, RapidLosses),
        TimeControlCategory.Daily => (DailyWins, DailyLosses),
        TimeControlCategory.Untimed => (UntimedWins, UntimedLosses),
        _ => throw new ArgumentOutOfRangeException(nameof(category)),
    };

    /// <summary>Increments either the win or the loss counter for one category by one.</summary>
    public void RecordResult(TimeControlCategory category, bool won)
    {
        switch (category)
        {
            case TimeControlCategory.Bullet: if (won) BulletWins++; else BulletLosses++; break;
            case TimeControlCategory.Blitz: if (won) BlitzWins++; else BlitzLosses++; break;
            case TimeControlCategory.Rapid: if (won) RapidWins++; else RapidLosses++; break;
            case TimeControlCategory.Daily: if (won) DailyWins++; else DailyLosses++; break;
            case TimeControlCategory.Untimed: if (won) UntimedWins++; else UntimedLosses++; break;
            default: throw new ArgumentOutOfRangeException(nameof(category));
        }
    }
}
