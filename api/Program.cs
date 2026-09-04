using System.Text.Json.Serialization;
using Khet.Api.Data;
using Khet.Api.Hubs;
using Khet.Api.Services;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// SignalR's JSON hub protocol has its own serializer options — the controller's AddJsonOptions
// does not reach it. Match the wire contract the frontend already expects: camelCase names
// (SignalR's default) and enums as their string names, not integers.
builder.Services.AddSignalR()
    .AddJsonProtocol(options =>
        options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddDbContext<KhetDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("KhetDb")));

builder.Services.AddScoped<GameService>();

var app = builder.Build();

// Behind Caddy the API only ever speaks plain HTTP on :8080, so trust the proxy's
// X-Forwarded-* to recover the real scheme and client IP. KnownNetworks/Proxies are
// cleared because the proxy is another container on the Docker network, not loopback.
var forwardedHeaders = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
};
forwardedHeaders.KnownIPNetworks.Clear();
forwardedHeaders.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeaders);

// The deployed container applies EF migrations on boot; local dev runs
// `dotnet ef database update` (see README), and `dotnet ef` design-time builds run
// as Development so they skip this too. compose waits for the db healthcheck, but
// retry anyway so a cold or briefly-restarting Postgres doesn't kill the container.
if (app.Environment.IsProduction())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<KhetDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            db.Database.Migrate();
            break;
        }
        catch (Exception ex) when (attempt < 10)
        {
            logger.LogWarning(ex, "Migration attempt {Attempt} failed; retrying in 3s", attempt);
            Thread.Sleep(TimeSpan.FromSeconds(3));
        }
    }
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthorization();

app.MapControllers();
app.MapHub<GameHub>("/api/hub");

app.Run();
