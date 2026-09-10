namespace Khet.Api.Auth;

/// <summary>
/// Bound from the <c>Admin</c> configuration section. There are no ASP.NET roles in this project
/// (<c>Program.cs</c>'s <c>AddIdentityCore</c> is role-less); admin is a single
/// <c>Khet.Api.Domain.ApplicationUser.IsAdmin</c> flag, and this is the one-time bootstrap for it.
///
/// <see cref="BootstrapEmail"/>, when set, is flipped to <c>IsAdmin = true</c> on every startup
/// (idempotent — a no-op once it's already set). It's an email address, not a credential, so it
/// lives in committed <c>appsettings.json</c>; override per-environment with <c>Admin__BootstrapEmail</c>
/// if that's ever unwanted. Null/empty disables the bootstrap entirely. After the first admin
/// exists, every further grant/revoke goes through the admin API.
/// </summary>
public sealed class AdminOptions
{
    public const string SectionName = "Admin";

    public string? BootstrapEmail { get; set; }
}
