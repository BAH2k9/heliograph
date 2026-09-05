using Khet.Api.Auth;
using Khet.Api.Contracts;
using Khet.Api.Data;
using Khet.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Khet.Api.Services;

public sealed class EmailAlreadyRegisteredException(string email) : Exception($"email '{email}' is already registered");

public sealed class AuthValidationException(string reason) : Exception(reason);

/// <summary>
/// Orchestrates register/login/refresh/logout/me: <see cref="UserManager{TUser}"/> owns account
/// creation and password checks, <see cref="JwtTokenService"/> owns the token math, this class
/// owns the refresh-token rows and stitches an <see cref="AuthResponse"/> together.
/// </summary>
public sealed class AuthService(
    UserManager<ApplicationUser> userManager,
    KhetDbContext db,
    JwtTokenService tokens,
    IOptions<JwtOptions> jwtOptions)
{
    private readonly JwtOptions _jwtOptions = jwtOptions.Value;

    /// <summary>Throws <see cref="EmailAlreadyRegisteredException"/> (→ 409) or <see cref="AuthValidationException"/> (→ 400).</summary>
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        var email = request.Email.Trim();
        var displayName = request.DisplayName.Trim();
        if (displayName.Length is 0 or > 32)
            throw new AuthValidationException("display name must be 1-32 characters");

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            DisplayName = displayName,
        };

        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code is "DuplicateEmail" or "DuplicateUserName"))
                throw new EmailAlreadyRegisteredException(email);
            throw new AuthValidationException(string.Join("; ", result.Errors.Select(e => e.Description)));
        }

        return await IssueTokensAsync(user, ct);
    }

    /// <summary>Null on a bad email/password — the controller turns that into a generic 401.</summary>
    public async Task<AuthResponse?> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var user = await userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null)
            return null;
        return await userManager.CheckPasswordAsync(user, request.Password)
            ? await IssueTokensAsync(user, ct)
            : null;
    }

    /// <summary>Rotates: the presented token is revoked and a fresh pair issued. Null if unknown/expired/already-revoked.</summary>
    public async Task<AuthResponse?> RefreshAsync(string rawToken, CancellationToken ct = default)
    {
        var hash = JwtTokenService.Hash(rawToken);
        var existing = await db.RefreshTokens.Include(t => t.User).FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (existing is null || !existing.IsActive)
            return null;

        existing.RevokedAtUtc = DateTime.UtcNow;
        return await IssueTokensAsync(existing.User, ct, existing);
    }

    /// <summary>Idempotent: revokes the token if it's known and still active, otherwise a no-op. Never fails.</summary>
    public async Task LogoutAsync(string rawToken, CancellationToken ct = default)
    {
        var hash = JwtTokenService.Hash(rawToken);
        var existing = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (existing is not { RevokedAtUtc: null })
            return;
        existing.RevokedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task<UserProfile?> GetProfileAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct);
        return user is null ? null : ToProfile(user);
    }

    private async Task<AuthResponse> IssueTokensAsync(ApplicationUser user, CancellationToken ct, RefreshToken? rotatedFrom = null)
    {
        var (accessToken, accessExpires) = tokens.CreateAccessToken(user);
        var rawRefresh = JwtTokenService.CreateRefreshTokenValue();
        var refreshExpires = DateTime.UtcNow.AddDays(_jwtOptions.RefreshTokenDays);

        var refreshRow = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = JwtTokenService.Hash(rawRefresh),
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = refreshExpires,
        };
        db.RefreshTokens.Add(refreshRow);
        if (rotatedFrom is not null)
            rotatedFrom.ReplacedByTokenHash = refreshRow.TokenHash;

        await db.SaveChangesAsync(ct);

        return new AuthResponse(accessToken, accessExpires, rawRefresh, refreshExpires, ToProfile(user));
    }

    private static UserProfile ToProfile(ApplicationUser user) =>
        new(user.Id, user.Email!, user.DisplayName, RatingBucketsFor(user));

    /// <summary>Always exactly 4 entries, one per <see cref="TimeControlCategory"/>, in enum declaration order.</summary>
    private static IReadOnlyList<RatingBucket> RatingBucketsFor(ApplicationUser user) =>
        Enum.GetValues<TimeControlCategory>()
            .Select(category =>
            {
                var (rating, gamesPlayed) = user.BucketFor(category);
                return new RatingBucket(category.ToString(), rating, gamesPlayed);
            })
            .ToList();
}
