namespace Heliograph.Contracts;

/// <summary>Body of every 4xx from the auth API: <c>{ "error": "reason" }</c> — same shape as <see cref="MoveError"/>.</summary>
public sealed record AuthError(string Error);

/// <summary>Body of <c>POST /api/auth/register</c>.</summary>
public sealed record RegisterRequest(string Email, string Password, string DisplayName);

/// <summary>
/// Body of <c>POST /api/auth/login</c>. <see cref="Email"/> takes an email <em>or</em> a display
/// name (see <c>Heliograph.Api.Services.AuthService.LoginAsync</c>). It keeps the name <c>email</c>
/// on the wire because a cached PWA build still posts <c>{ email, password }</c>, and renaming
/// the field would break login for those clients.
/// </summary>
public sealed record LoginRequest(string Email, string Password);

/// <summary>Body of <c>POST /api/auth/refresh</c> and <c>POST /api/auth/logout</c>.</summary>
public sealed record RefreshRequest(string RefreshToken);

/// <summary>
/// The public-facing shape of an account: <see cref="DisplayName"/> (not <c>UserName</c>/<c>Email</c>)
/// is what's shown in rooms and the leaderboard. Returned by <c>GET /api/auth/me</c>,
/// <c>PATCH /api/auth/me</c>, and embedded in every <see cref="AuthResponse"/>.
/// <see cref="AvatarId"/> mirrors <c>Heliograph.Api.Domain.ApplicationUser.AvatarId</c> — null means no
/// avatar picked yet (frontend falls back to the initial-letter render). <see cref="Ratings"/> is
/// always exactly 5 entries, one per <c>Heliograph.Clock.TimeControlCategory</c> name, even at the
/// 1200/0 default. <see cref="TotalGamesPlayed"/> is the sum of <c>GamesPlayed</c> across all five
/// buckets — a derived value computed by the mapper, not a stored column (see
/// <c>AuthService.RatingBucketsFor</c>). <see cref="IsAdmin"/> mirrors
/// <c>Heliograph.Api.Domain.ApplicationUser.IsAdmin</c> — the frontend uses it to show/guard the
/// <c>/admin</c> area; it only ever flips via the admin API.
/// </summary>
public sealed record UserProfile(
    Guid Id,
    string Email,
    string DisplayName,
    string? AvatarId,
    IReadOnlyList<RatingBucket> Ratings,
    int TotalGamesPlayed,
    bool IsAdmin);

/// <summary>
/// Body of <c>PATCH /api/auth/me</c>. Both fields optional; a null/omitted field leaves that part
/// of the profile unchanged (no way to distinguish omitted from explicit JSON <c>null</c> once
/// deserialized, so this endpoint doesn't offer a "clear back to no avatar" affordance — pick a
/// different preset instead). <see cref="AvatarId"/> must be one of <c>Heliograph.Api.Domain.AvatarCatalog.Names</c>
/// (400 <c>UnknownAvatarException</c> otherwise); <see cref="DisplayName"/>, if supplied, must not
/// be empty/whitespace after trimming (400).
/// </summary>
public sealed record PatchMeRequest(string? DisplayName = null, string? AvatarId = null);

/// <summary>
/// One time-control category's rating bucket — see <c>Heliograph.Api.Domain.ApplicationUser.BucketFor</c>/
/// <c>WinLossFor</c>.
/// </summary>
public sealed record RatingBucket(string Category, int Rating, int GamesPlayed, int Wins, int Losses);

/// <summary>
/// A trimmed, public-facing profile for a seat in a game — no email, no account id, no games list.
/// Returned by <c>GET /api/games/{id}/players/{seat}</c>; reachable by anyone who can view the game,
/// including spectators (see <c>backlog/09-player-info-popup.md</c>'s owner decision).
/// </summary>
public sealed record PublicPlayerProfile(
    string DisplayName,
    string? AvatarId,
    int TotalGamesPlayed,
    IReadOnlyList<RatingBucket> Ratings);

/// <summary>
/// Returned by register/login/refresh. <see cref="AccessToken"/> is a short-lived JWT (bearer
/// header); <see cref="RefreshToken"/> is an opaque string, body transport only — not a JWT, not a
/// cookie. Refreshing rotates it: the presented token is revoked and a new one issued.
/// </summary>
public sealed record AuthResponse(
    string AccessToken,
    DateTime AccessTokenExpiresAtUtc,
    string RefreshToken,
    DateTime RefreshTokenExpiresAtUtc,
    UserProfile User);
