namespace Heliograph.Api.Auth;

/// <summary>
/// Bound from the <c>Jwt</c> configuration section. <see cref="Key"/> follows the project's usual
/// credentials convention — <c>dotnet user-secrets</c> locally, <c>Jwt__Key</c> from <c>.env</c> on
/// the deploy host, a <c>CHANGEME</c> placeholder in committed <c>appsettings.*.json</c>.
/// Needs to be at least 256 bits (32 ASCII chars) — HS256 throws on a shorter key.
/// </summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Key { get; set; } = default!;

    public string Issuer { get; set; } = default!;

    public string Audience { get; set; } = default!;

    public int AccessTokenMinutes { get; set; } = 15;

    public int RefreshTokenDays { get; set; } = 30;
}
