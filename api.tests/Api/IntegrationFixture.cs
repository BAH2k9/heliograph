using System.Data.Common;
using System.Net.Sockets;
using Khet.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
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
    private const string DefaultConnectionString =
        "Host=localhost;Port=5432;Database=khet_test;Username=khet;Password=khetlocaldev";

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

    public sealed class ApiFactory : WebApplicationFactory<Program>
    {
        public string ConnectionString { get; } =
            Environment.GetEnvironmentVariable("KHET_TEST_DB") is { Length: > 0 } fromEnv
                ? fromEnv
                : DefaultConnectionString;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            // "Testing" != Production, so Program.cs skips its boot-time Migrate() — the fixture
            // owns schema setup here instead.
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) =>
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:KhetDb"] = ConnectionString,
                }));
        }
    }
}

[CollectionDefinition(Name)]
public sealed class IntegrationCollection : ICollectionFixture<IntegrationFixture>
{
    public const string Name = "integration";
}
