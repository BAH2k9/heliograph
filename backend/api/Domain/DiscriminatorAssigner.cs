namespace Khet.Api.Domain;

/// <summary>
/// Generates a candidate <see cref="ApplicationUser.Discriminator"/> value. Every account-creation
/// path (<c>AuthService.RegisterAsync</c>, <c>AdminService.CreateUserAsync</c>) assigns one of these
/// and retries on the <c>(DisplayName, Discriminator)</c> unique-index collision — same shape as
/// <c>RoomService.NewCode()</c>'s join-code retry: detach the failed insert, generate a fresh
/// candidate, try again, up to <see cref="MaxAttempts"/> times.
/// </summary>
public static class DiscriminatorAssigner
{
    public const int MaxAttempts = 5;

    /// <summary>
    /// Test-only seam (see <c>InternalsVisibleTo("Khet.Api.Tests")</c> in <c>Khet.Api.csproj</c>):
    /// when set, <see cref="NewCandidate"/> draws from this instead of <see cref="Random.Shared"/>,
    /// so a test can force a deterministic <c>(DisplayName, Discriminator)</c> collision and assert
    /// the retry loop in <c>AuthService.RegisterAsync</c>/<c>AdminService.CreateUserAsync</c> re-rolls
    /// and succeeds, rather than relying on the birthday bound over many real registrations. Null in
    /// production; reset it (in a <c>finally</c>) after use — it's process-global.
    /// </summary>
    internal static Func<string>? CandidateOverrideForTests;

    public static string NewCandidate() =>
        CandidateOverrideForTests?.Invoke() ?? Random.Shared.Next(0, 10_000).ToString("D4");
}
