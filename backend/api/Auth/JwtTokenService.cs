using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Heliograph.Api.Domain;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Heliograph.Api.Auth;

/// <summary>
/// Issues access tokens and opaque refresh-token values. Kept separate from
/// <c>Services.AuthService</c> (which owns persistence/orchestration) so the pure token math has
/// no DbContext dependency.
/// </summary>
public sealed class JwtTokenService(IOptions<JwtOptions> options)
{
    private readonly JwtOptions _options = options.Value;

    /// <summary>
    /// The claim type carried when the account is an admin (value always <c>"true"</c>). Because
    /// <c>Program.cs</c> sets <c>MapInboundClaims = false</c>, this exact string is also what the
    /// <c>"Admin"</c> authorization policy's <c>RequireClaim</c> must match — reference this constant
    /// from both sides rather than retyping the literal.
    /// </summary>
    public const string AdminClaimType = "is_admin";

    /// <summary>
    /// Claims: <c>sub</c> = user id, <c>email</c>, <c>name</c> = <see cref="ApplicationUser.DisplayName"/>
    /// (the public identity, not <c>UserName</c>), and — only for an admin account —
    /// <see cref="AdminClaimType"/> = <c>"true"</c>. Program.cs sets <c>MapInboundClaims = false</c> so
    /// these come back on <see cref="ClaimsPrincipal"/> under these exact names, not remapped to
    /// <see cref="ClaimTypes"/> URIs.
    /// </summary>
    public (string Token, DateTime ExpiresAtUtc) CreateAccessToken(ApplicationUser user)
    {
        var now = DateTime.UtcNow;
        var expires = now.AddMinutes(_options.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new(JwtRegisteredClaimNames.Name, user.DisplayName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        if (user.IsAdmin)
            claims.Add(new Claim(AdminClaimType, "true"));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var handler = new JsonWebTokenHandler();
        var token = handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            Claims = claims.ToDictionary(c => c.Type, c => (object)c.Value),
            NotBefore = now,
            Expires = expires,
            SigningCredentials = creds,
        });

        return (token, expires);
    }

    /// <summary>32 random bytes, base64url-encoded. Never persisted raw — see <see cref="Hash"/>.</summary>
    public static string CreateRefreshTokenValue() =>
        Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));

    /// <summary>SHA-256 of a raw refresh-token value, for at-rest storage/lookup.</summary>
    public static string Hash(string rawToken) =>
        Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
}
