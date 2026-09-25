using Heliograph.Api.Auth;
using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Contracts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Heliograph.Api.Services;

public sealed class EmailAlreadyRegisteredException(string email) : Exception($"email '{email}' is already registered");

public sealed class AuthValidationException(string reason) : Exception(reason);

/// <summary>
/// Orchestrates register/login/refresh/logout/me: <see cref="UserManager{TUser}"/> owns account
/// creation and password checks, <see cref="JwtTokenService"/> owns the token math, this class
/// owns the refresh-token rows and stitches an <see cref="AuthResponse"/> together.
/// </summary>
public sealed class AuthService(
    UserManager<ApplicationUser> userManager,
    HeliographDbContext db,
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
            CreatedAtUtc = DateTime.UtcNow,
        };

        // Retry only guards the astronomically unlikely (DisplayName, Discriminator) collision —
        // same shape as RoomService.NewCode()'s join-code retry.
        for (var attempt = 1; ; attempt++)
        {
            user.Discriminator = DiscriminatorAssigner.NewCandidate();
            try
            {
                var result = await userManager.CreateAsync(user, request.Password);
                if (!result.Succeeded)
                {
                    if (result.Errors.Any(e => e.Code is "DuplicateEmail" or "DuplicateUserName"))
                        throw new EmailAlreadyRegisteredException(email);
                    throw new AuthValidationException(string.Join("; ", result.Errors.Select(e => e.Description)));
                }
                break;
            }
            catch (DbUpdateException) when (attempt < DiscriminatorAssigner.MaxAttempts)
            {
                db.Entry(user).State = EntityState.Detached;
            }
        }

        return await IssueTokensAsync(user, ct);
    }

    /// <summary>
    /// Most accounts sharing one display name that a single login attempt will check a password
    /// against — see <see cref="LoginCandidatesAsync"/>. Bounds the password-hash work one request
    /// can cause; an account past the cap can still log in by email.
    /// </summary>
    private const int MaxDisplayNameCandidates = 10;

    /// <summary>
    /// <see cref="LoginRequest.Email"/> is an email or a display name — see
    /// <see cref="LoginCandidatesAsync"/>. Null on a bad login/password, or when the password only
    /// matches a disabled account — the controller turns any null into the same generic 401, so a
    /// disabled user can't tell a lockout apart from a wrong password.
    /// </summary>
    public async Task<AuthResponse?> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        foreach (var user in await LoginCandidatesAsync(request.Email.Trim(), ct))
        {
            if (!await userManager.CheckPasswordAsync(user, request.Password))
                continue;
            if (user.IsDisabled)
                continue;
            return await IssueTokensAsync(user, ct);
        }
        return null;
    }

    /// <summary>
    /// The account whose email is <paramref name="login"/>, if there is one. Otherwise every account
    /// whose display name matches it case-insensitively, oldest first. Display names aren't unique
    /// (only <c>DisplayName#Discriminator</c> is), so the caller checks the password against each
    /// one and the first match wins. Two same-named accounts with the same password therefore
    /// resolve to the older one, and the newer one has to log in by email.
    /// </summary>
    private async Task<IReadOnlyList<ApplicationUser>> LoginCandidatesAsync(string login, CancellationToken ct)
    {
        if (await userManager.FindByEmailAsync(login) is { } byEmail)
            return [byEmail];

        var lowered = login.ToLowerInvariant();
        return await db.Users
            .Where(u => u.DisplayName.ToLower() == lowered)
            .OrderBy(u => u.CreatedAtUtc)
            .Take(MaxDisplayNameCandidates)
            .ToListAsync(ct);
    }

    /// <summary>
    /// Rotates: the presented token is revoked and a fresh pair issued. Null if
    /// unknown/expired/already-revoked, or if the owning account has since been disabled (an admin
    /// disabling a user also revokes their tokens, but this closes the race on one already in flight).
    /// </summary>
    public async Task<AuthResponse?> RefreshAsync(string rawToken, CancellationToken ct = default)
    {
        var hash = JwtTokenService.Hash(rawToken);
        var existing = await db.RefreshTokens.Include(t => t.User).FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (existing is null || !existing.IsActive)
            return null;
        if (existing.User.IsDisabled)
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

    /// <summary>
    /// Applies a partial profile update. Both fields are optional; a null/omitted field leaves that
    /// part of the profile unchanged (there's no way to distinguish "omitted" from an explicit JSON
    /// <c>null</c> once deserialized into a plain <c>string?</c>, so this endpoint has no "clear back
    /// to unset" affordance for either field — a fresh display name or avatar id simply overwrites
    /// the old one). Throws <see cref="AuthValidationException"/> (→ 400) for a blank display name,
    /// or <see cref="UnknownAvatarException"/> (→ 400) for an avatar id outside
    /// <see cref="AvatarCatalog.Names"/>. Null if no account has this id.
    /// </summary>
    public async Task<UserProfile?> UpdateProfileAsync(Guid userId, PatchMeRequest request, CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
            return null;

        if (request.DisplayName is { } displayName)
        {
            var trimmed = displayName.Trim();
            if (trimmed.Length is 0 or > 32)
                throw new AuthValidationException("display name must be 1-32 characters");
            user.DisplayName = trimmed;
        }

        if (request.AvatarId is { } avatarId)
            user.AvatarId = AvatarCatalog.For(avatarId);

        await db.SaveChangesAsync(ct);
        return ToProfile(user);
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
        new(
            user.Id,
            user.Email!,
            user.DisplayName,
            user.AvatarId,
            RatingBucketMapper.RatingBucketsFor(user),
            RatingBucketMapper.TotalGamesPlayedFor(user),
            user.IsAdmin);
}
