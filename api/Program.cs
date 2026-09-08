using System.Text;
using System.Text.Json.Serialization;
using Khet.Api.Auth;
using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Api.Hubs;
using Khet.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// SignalR's JSON hub protocol has its own serializer options — the controller's AddJsonOptions
// does not reach it. Match the wire contract the frontend already expects: camelCase names
// (SignalR's default) and enums as their string names, not integers.
builder.Services.AddSignalR(options =>
    {
        if (builder.Environment.EnvironmentName == "Testing")
            options.EnableDetailedErrors = true;
    })
    .AddJsonProtocol(options =>
        options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddDbContext<KhetDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("KhetDb")));

// The BCL clock abstraction, not a custom interface — GameService takes this instead of calling
// DateTime.UtcNow directly, so tests can substitute Microsoft.Extensions.Time.Testing's
// FakeTimeProvider (see IntegrationFixture) for deterministic clock-expiry assertions.
builder.Services.AddSingleton(TimeProvider.System);

builder.Services.AddScoped<GameService>();
// GameService's collaborators. GameEndService MUST be AddScoped: it mutates the tracked Game +
// AspNetUsers rows inside the transaction GameService opened, so it has to resolve the same
// per-request KhetDbContext — a Singleton/Transient-with-its-own-context registration would break
// single-transaction atomicity with every test still green. GameClockLifecycle is stateless but
// registered the same way for consistency. The DI-lifetime guard test asserts both stay Scoped.
builder.Services.AddScoped<GameClockLifecycle>();
builder.Services.AddScoped<GameEndService>();
builder.Services.AddScoped<GameResponseMapper>();
builder.Services.AddScoped<LeaderboardService>();

// One instance for the whole process — GameHub reads/writes it directly (see its own doc
// comment). In-memory only, never persisted; a restart just forgets every entry, which is fine.
builder.Services.AddSingleton<GameConnectionTracker>();

// AddIdentityCore, not AddIdentity — there's no role concept here, and the API is JWT-only
// (no cookie auth, no SignInManager). UserManager.CheckPasswordAsync covers login.
builder.Services.AddIdentityCore<ApplicationUser>(options =>
    {
        // Relaxed from Identity's default (which also requires upper/lower/non-alphanumeric) —
        // this is a portfolio project, not a compliance target.
        options.Password.RequireDigit = true;
        options.Password.RequiredLength = 8;
        options.Password.RequireLowercase = false;
        options.Password.RequireUppercase = false;
        options.Password.RequireNonAlphanumeric = false;
        options.User.RequireUniqueEmail = true;
    })
    .AddEntityFrameworkStores<KhetDbContext>();

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddScoped<AuthService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();

// Configured via IOptions<JwtOptions> (resolved from DI at options-build time), not read off
// builder.Configuration directly above — WebApplicationFactory (see IntegrationFixture) layers its
// test config on *after* Program.cs's top-level statements run, so an eager read here would see
// the real appsettings only and get an empty/placeholder key in every test.
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((bearerOptions, jwtOptions) =>
    {
        var jwt = jwtOptions.Value;

        // Keep the "sub"/"email"/"name" claim names as issued (see JwtTokenService) instead of
        // ASP.NET's default remap to long ClaimTypes URIs — that's the contract published to the
        // frontend, so it must come back on ClaimsPrincipal exactly as written.
        bearerOptions.MapInboundClaims = false;
        bearerOptions.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key ?? string.Empty)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
        // Browsers can't set an Authorization header on a WebSocket upgrade — SignalR's
        // accessTokenFactory instead sends the token as ?access_token= on the connect request.
        // Only honour that for the hub path; every other endpoint still requires a real header.
        bearerOptions.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/api/hub"))
                    context.Token = accessToken;
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();

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

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<GameHub>("/api/hub");

app.Run();
