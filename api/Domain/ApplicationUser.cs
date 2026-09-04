using Microsoft.AspNetCore.Identity;

namespace Khet.Api.Domain;

/// <summary>
/// An account. Identity owns <c>UserName</c>/<c>Email</c>/<c>PasswordHash</c>; everything below is
/// this app's own. <see cref="DisplayName"/> is the public-facing identity (rooms, leaderboard) —
/// deliberately separate from <c>UserName</c>/<c>Email</c> so it can change without touching login
/// credentials. <see cref="Rating"/>/<see cref="RatedGamesPlayed"/> are the Elo groundwork: every
/// account starts at 1200 and 0, and both only move together, via <c>EloService</c>, when a game
/// with <c>Game.Rated</c> true finishes.
/// </summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = default!;

    public int Rating { get; set; } = 1200;

    public int RatedGamesPlayed { get; set; }
}
