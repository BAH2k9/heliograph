using Heliograph.Api.Auth;
using Heliograph.Api.Domain;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Heliograph.Api.Tests.Auth;

/// <summary>
/// Pure, no-DB tests of the token math: the exact claim names/values published to the frontend
/// as the JWT contract, and that refresh-token values/hashes behave as advertised.
/// </summary>
public class JwtTokenServiceTests
{
    private static readonly JwtOptions JwtSettings = new()
    {
        Key = "unit-test-signing-key-at-least-256-bits-long-0123456789",
        Issuer = "khet-web-test",
        Audience = "khet-web-test",
        AccessTokenMinutes = 15,
        RefreshTokenDays = 30,
    };

    private static readonly ApplicationUser User = new()
    {
        Id = Guid.Parse("11111111-2222-3333-4444-555555555555"),
        Email = "player@example.com",
        DisplayName = "Player One",
    };

    private static JwtTokenService NewService() => new(Options.Create(JwtSettings));

    [Fact]
    public void CreateAccessToken_carries_sub_email_and_name_as_the_display_name()
    {
        var service = NewService();

        var (token, expiresAtUtc) = service.CreateAccessToken(User);

        var parsed = new JsonWebToken(token);
        Assert.Equal(User.Id.ToString(), parsed.GetClaim(JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal(User.Email, parsed.GetClaim(JwtRegisteredClaimNames.Email).Value);
        Assert.Equal(User.DisplayName, parsed.GetClaim(JwtRegisteredClaimNames.Name).Value);
        Assert.Equal(JwtSettings.Issuer, parsed.Issuer);
        Assert.Contains(JwtSettings.Audience, parsed.Audiences);
        Assert.True(expiresAtUtc > DateTime.UtcNow.AddMinutes(14));
        Assert.True(expiresAtUtc <= DateTime.UtcNow.AddMinutes(15).AddSeconds(5));
    }

    [Fact]
    public void CreateRefreshTokenValue_returns_distinct_values_each_call()
    {
        var a = JwtTokenService.CreateRefreshTokenValue();
        var b = JwtTokenService.CreateRefreshTokenValue();

        Assert.NotEqual(a, b);
        Assert.True(a.Length >= 32); // base64url of 32 random bytes
    }

    [Fact]
    public void Hash_is_deterministic_and_never_equal_to_the_raw_value()
    {
        var raw = JwtTokenService.CreateRefreshTokenValue();

        var hash1 = JwtTokenService.Hash(raw);
        var hash2 = JwtTokenService.Hash(raw);

        Assert.Equal(hash1, hash2);
        Assert.NotEqual(raw, hash1);
    }
}
