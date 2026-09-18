namespace Khet.Api.Auth;

/// <summary>
/// Bound from the <c>RateLimit</c> configuration section. Only <c>POST /api/auth/login</c> is
/// limited: it's the entire unauthenticated write surface (see <c>AuthController</c>'s doc comment
/// — there's no self-registration endpoint), and nothing else anonymous either writes or touches
/// the DB. <c>/api/auth/refresh</c> is deliberately left alone: its token is 32 random bytes
/// (<see cref="JwtTokenService.GenerateRefreshToken"/>), so guessing isn't a threat model a
/// request budget improves on.
///
/// The defaults are sized for a private, admin-created-accounts app: a human fumbling their
/// password never hits 10 tries in 5 minutes, while an attacker is held to ~2,880 guesses a day
/// against the relaxed 8-char password policy (<c>Program.cs</c>'s <c>AddIdentityCore</c>). Override
/// per-environment with <c>RateLimit__LoginPermitLimit</c> / <c>RateLimit__LoginWindowSeconds</c>.
/// </summary>
public sealed class RateLimitOptions
{
    public const string SectionName = "RateLimit";

    /// <summary>
    /// Name of the login policy, shared between <c>Program.cs</c>'s <c>AddRateLimiter</c> and
    /// <c>AuthController.Login</c>'s <c>[EnableRateLimiting]</c> — a mismatch between the two is a
    /// startup exception, so it's a constant rather than a literal retyped in both places.
    /// </summary>
    public const string LoginPolicy = "login";

    /// <summary>Login attempts allowed per client IP per <see cref="LoginWindowSeconds"/>.</summary>
    public int LoginPermitLimit { get; set; } = 10;

    /// <summary>Length of the fixed window, in seconds.</summary>
    public int LoginWindowSeconds { get; set; } = 300;
}
