namespace Heliograph.Api.Domain;

/// <summary>
/// One issued refresh token. The raw token value is never stored — only its SHA-256 hash
/// (<see cref="TokenHash"/>), so a leaked DB row can't be replayed as a token. Rotated on every
/// use: <c>POST /api/auth/refresh</c> revokes the presented token
/// (<see cref="RevokedAtUtc"/> set, <see cref="ReplacedByTokenHash"/> pointing at the new one)
/// and issues a fresh row.
/// </summary>
public class RefreshToken
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public ApplicationUser User { get; set; } = default!;

    public string TokenHash { get; set; } = default!;

    public DateTime CreatedAtUtc { get; set; }

    public DateTime ExpiresAtUtc { get; set; }

    public DateTime? RevokedAtUtc { get; set; }

    public string? ReplacedByTokenHash { get; set; }

    public bool IsActive => RevokedAtUtc is null && DateTime.UtcNow < ExpiresAtUtc;
}
