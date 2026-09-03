using System.Text.Json.Serialization;
using Khet.Api.Data;
using Khet.Api.Services;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
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
forwardedHeaders.KnownNetworks.Clear();
forwardedHeaders.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeaders);

// The deployed container applies EF migrations on boot; local dev runs
// `dotnet ef database update` (see README), and `dotnet ef` design-time builds run
// as Development so they skip this too.
if (app.Environment.IsProduction())
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<KhetDbContext>().Database.Migrate();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthorization();

app.MapControllers();

app.Run();
