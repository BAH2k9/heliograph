namespace Khet.Api.Auth;

/// <summary>
/// Bound from the <c>Admin</c> configuration section. There are no ASP.NET roles in this project
/// (<c>Program.cs</c>'s <c>AddIdentityCore</c> is role-less); admin is a single
/// <c>Khet.Api.Domain.ApplicationUser.IsAdmin</c> flag, and this is the one-time bootstrap for it.
///
/// <see cref="BootstrapEmail"/>, when set, is flipped to <c>IsAdmin = true</c> on every startup
/// (idempotent — a no-op once it's already set). Even though it's an email address rather than a
/// credential, it's still someone's personal identifier, so <c>appsettings.json</c> commits it as
/// <c>""</c>; every real environment supplies it via <c>Admin__BootstrapEmail</c> (see
/// <c>infra/.env.example</c>). Null/empty disables the bootstrap entirely — see <c>Program.cs</c>'s
/// startup block, which is a no-op (and logs nothing) in that case. After the first admin exists,
/// every further grant/revoke goes through the admin API.
/// </summary>
public sealed class AdminOptions
{
    public const string SectionName = "Admin";

    public string? BootstrapEmail { get; set; }
}
