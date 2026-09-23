using Heliograph.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Heliograph.Api.Tests.Api;

/// <summary>
/// The <c>Program.cs</c> admin-bootstrap block (IP-07) only runs outside the "Testing" environment
/// (see <see cref="IntegrationFixture.ApiFactory"/>'s doc comment), so <see cref="IntegrationFixture.Factory"/>
/// itself never exercises it. These tests boot a second server, over the same already-migrated
/// database, under the "Development" environment instead — real enough to run the bootstrap block
/// without also triggering the <c>IsProduction()</c>-gated migration-retry loop above it.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class AdminBootstrapIntegrationTests(IntegrationFixture fixture)
{
    private WebApplicationFactory<Program> WithBootstrapEmail(string? email) =>
        fixture.Factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) =>
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Admin:BootstrapEmail"] = email,
                }));
        });

    /// <summary>
    /// An empty/missing <c>Admin:BootstrapEmail</c> (the committed <c>appsettings.json</c> default,
    /// and the default for any deploy that doesn't set <c>Admin__BootstrapEmail</c>) must not throw,
    /// and must not touch any account's <c>IsAdmin</c> flag.
    /// </summary>
    [SkippableTheory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Empty_or_missing_bootstrap_email_is_a_safe_no_op(string? bootstrapEmail)
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        var email = $"bootstrap-noop-{Guid.NewGuid():N}@example.com";
        await fixture.RegisterAsync(email, "Bootstrap Noop");

        // Accessing .Services builds and starts the host, running Program.cs's top-level statements
        // — including the bootstrap block under test — synchronously before this returns.
        await using var factory = WithBootstrapEmail(bootstrapEmail);
        using var scope = factory.Services.CreateScope();

        using var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
        var isAdmin = await db.Users
            .Where(u => u.Email == email)
            .Select(u => u.IsAdmin)
            .SingleAsync();
        Assert.False(isAdmin);
    }

    /// <summary>
    /// Existing behaviour, unchanged by IP-07: a real, matching <c>Admin:BootstrapEmail</c> still
    /// flips that account to admin on startup (case-insensitively), idempotently.
    /// </summary>
    [SkippableFact]
    public async Task Set_bootstrap_email_promotes_the_matching_account()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        var email = $"Bootstrap-Yes-{Guid.NewGuid():N}@example.com";
        await fixture.RegisterAsync(email, "Bootstrap Yes");

        await using var factory = WithBootstrapEmail(email.ToUpperInvariant());
        using var scope = factory.Services.CreateScope();
        using var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
        var isAdmin = await db.Users
            .Where(u => u.Email == email)
            .Select(u => u.IsAdmin)
            .SingleAsync();
        Assert.True(isAdmin);
    }
}
