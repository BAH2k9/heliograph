using System.Data.Common;
using System.Net.Sockets;
using Khet.Api.Data;
using Khet.Api.Services;
using Khet.Contracts;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Npgsql;

namespace Khet.Api.Tests.Api;

/// <summary>
/// Boots the real API against a throwaway Postgres database (<c>khet_test</c> by default, or
/// whatever <c>KHET_TEST_DB</c> points at). CI supplies a <c>postgres:16</c> service; locally it
/// uses the same Docker DB as dev, on a separate database name. If no Postgres is reachable the
/// DB-backed tests skip rather than fail, so <c>dotnet test</c> still works for engine-only work.
/// </summary>
public sealed class IntegrationFixture : IAsyncLifetime
{
    // 127.0.0.1, not "localhost": on Windows + Docker Desktop, resolving "localhost" tries ::1
    // first and Windows drops the SYN, costing ~7s per new connection. CI overrides this anyway.
    private const string DefaultConnectionString =
        "Host=127.0.0.1;Port=5432;Database=khet_test;Username=khet;Password=khetlocaldev";

    public ApiFactory Factory { get; } = new();

    /// <summary>Non-null when Postgres could not be reached; tests use it as the skip reason.</summary>
    public string? UnavailableReason { get; private set; }

    public async Task InitializeAsync()
    {
        // Probe the server itself (via the maintenance DB, since khet_test may not exist yet).
        // A connection failure here means "no Postgres" -> skip. Anything that goes wrong once
        // we're connected (a broken migration) is a real failure and propagates.
        var probe = new NpgsqlConnectionStringBuilder(Factory.ConnectionString)
        {
            Database = "postgres",
            Timeout = 3,
        }.ConnectionString;
        try
        {
            await using var connection = new NpgsqlConnection(probe);
            await connection.OpenAsync();
        }
        catch (Exception ex) when (ex is DbException or SocketException or TimeoutException)
        {
            UnavailableReason =
                $"Postgres not reachable for integration tests ({ex.GetType().Name}: {ex.Message}). " +
                "Start it with `docker compose up -d db`, or set KHET_TEST_DB.";
            return;
        }

        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KhetDbContext>();
        await db.Database.EnsureDeletedAsync();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync() => await Factory.DisposeAsync();

    /// <summary>
    /// A second server over the same database with a tighter <c>RateLimit:LoginPermitLimit</c>.
    /// Its own server means its own partition cache, so a test that deliberately spends the whole
    /// login budget can't leak 429s into the shared <see cref="Factory"/> every other test uses.
    /// Caller disposes.
    /// </summary>
    public WebApplicationFactory<Program> WithLoginLimit(int permitLimit, int windowSeconds = 300) =>
        Factory.WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, config) =>
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["RateLimit:LoginPermitLimit"] = permitLimit.ToString(),
                    ["RateLimit:LoginWindowSeconds"] = windowSeconds.ToString(),
                })));

    /// <summary>
    /// Creates a throwaway account directly via <see cref="AuthService.RegisterAsync"/>, bypassing
    /// HTTP — there's no public register endpoint anymore (accounts are admin-created in
    /// production; see <c>AuthController</c>'s doc comment). This is the one place integration
    /// tests should stand up a test account; each test file's own local <c>RegisterAsync</c> helper
    /// delegates here instead of reimplementing it.
    /// </summary>
    public async Task<AuthResponse> RegisterAsync(string? email = null, string? displayName = null, string password = "correct-horse-1")
    {
        using var scope = Factory.Services.CreateScope();
        var auth = scope.ServiceProvider.GetRequiredService<AuthService>();
        return await auth.RegisterAsync(new RegisterRequest(
            email ?? $"user-{Guid.NewGuid():N}@example.com",
            password,
            displayName ?? "Test Player"));
    }

    public sealed class ApiFactory : WebApplicationFactory<Program>
    {
        public string ConnectionString { get; } =
            Environment.GetEnvironmentVariable("KHET_TEST_DB") is { Length: > 0 } fromEnv
                ? fromEnv
                : DefaultConnectionString;

        /// <summary>
        /// One clock, shared by every test in this collection (see <see cref="IntegrationCollection"/>).
        /// Seeded to real <see cref="DateTimeOffset.UtcNow"/> at fixture init — not epoch — because
        /// plenty of existing tests read timestamps like <c>CreatedAtUtc</c>/<c>FinishedAtUtc</c> and
        /// would break against a frozen 1970 clock. Advance it per-test with <c>SetUtcNow(...)</c>;
        /// since it only ever advances, an earlier test's advance is benign for later tests that
        /// merely read "close to now" timestamps.
        /// </summary>
        public FakeTimeProvider TimeProvider { get; } = new(DateTimeOffset.UtcNow);

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            // "Testing" != Production, so Program.cs skips its boot-time Migrate() — the fixture
            // owns schema setup here instead.
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) =>
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:KhetDb"] = ConnectionString,
                    // Program.cs builds a SymmetricSecurityKey from this at startup — an empty/short
                    // placeholder throws before any test gets to run, not just the new auth ones.
                    ["Jwt:Key"] = "test-signing-key-not-for-any-real-deploy-0123456789",
                    ["Jwt:Issuer"] = "khet-web-test",
                    ["Jwt:Audience"] = "khet-web-test",
                    // The login rate limiter partitions on RemoteIpAddress, which is null for every
                    // TestServer request — so the whole collection shares one bucket and the
                    // production default (10 per 5 min) would start 429ing unrelated tests as soon
                    // as an eleventh login appeared anywhere. Effectively disabled here; the tests
                    // that actually exercise the limit dial it back down on their own server via
                    // WithLoginLimit below.
                    ["RateLimit:LoginPermitLimit"] = "100000",
                }));
            builder.ConfigureTestServices(services =>
                services.AddSingleton<System.TimeProvider>(TimeProvider));
        }
    }
}

[CollectionDefinition(Name)]
public sealed class IntegrationCollection : ICollectionFixture<IntegrationFixture>
{
    public const string Name = "integration";
}
