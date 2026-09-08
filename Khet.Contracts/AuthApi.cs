namespace Khet.Contracts;

/// <summary>Body of every 4xx from the auth API: <c>{ "error": "reason" }</c> — same shape as <see cref="MoveError"/>.</summary>
public sealed record AuthError(string Error);

/// <summary>Body of <c>POST /api/auth/register</c>.</summary>
public sealed record RegisterRequest(string Email, string Password, string DisplayName);

/// <summary>Body of <c>POST /api/auth/login</c>.</summary>
public sealed record LoginRequest(string Email, string Password);

/// <summary>Body of <c>POST /api/auth/refresh</c> and <c>POST /api/auth/logout</c>.</summary>
public sealed record RefreshRequest(string RefreshToken);

/// <summary>
/// The public-facing shape of an account: <see cref="DisplayName"/> (not <c>UserName</c>/<c>Email</c>)
/// is what's shown in rooms and the leaderboard. Returned by <c>GET /api/auth/me</c>,
/// <c>PATCH /api/auth/me</c>, and embedded in every <see cref="AuthResponse"/>.
/// <see cref="AvatarId"/> mirrors <c>Khet.Api.Domain.ApplicationUser.AvatarId</c> — null means no
/// avatar picked yet (frontend falls back to the initial-letter render). <see cref="Ratings"/> is
/// always exactly 4 entries, one per <c>Khet.Clock.TimeControlCategory</c> name, even at the
/// 1200/0 default.
/// </summary>
public sealed record UserProfile(Guid Id, string Email, string DisplayName, string? AvatarId, IReadOnlyList<RatingBucket> Ratings);

/// <summary>
/// Body of <c>PATCH /api/auth/me</c>. Both fields optional; a null/omitted field leaves that part
/// of the profile unchanged (no way to distinguish omitted from explicit JSON <c>null</c> once
/// deserialized, so this endpoint doesn't offer a "clear back to no avatar" affordance — pick a
/// different preset instead). <see cref="AvatarId"/> must be one of <c>Khet.Api.Domain.AvatarCatalog.Names</c>
/// (400 <c>UnknownAvatarException</c> otherwise); <see cref="DisplayName"/>, if supplied, must not
/// be empty/whitespace after trimming (400).
/// </summary>
public sealed record PatchMeRequest(string? DisplayName = null, string? AvatarId = null);

/// <summary>One time-control category's rating bucket — see <c>Khet.Api.Domain.ApplicationUser.BucketFor</c>.</summary>
public sealed record RatingBucket(string Category, int Rating, int GamesPlayed);

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
