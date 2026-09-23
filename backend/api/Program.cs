using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Heliograph.Api.Auth;
using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Api.Hubs;
using Heliograph.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Replaces the default Microsoft.Extensions.Logging console provider. Levels/overrides come from
// the "Serilog" section in appsettings*.json via ReadFrom.Configuration; the sinks themselves are
// wired in code (not config-driven "WriteTo" entries) because Serilog.Settings.Configuration loads
// sink assemblies by name via reflection, and that assembly-probing fails under the test host
// (WebApplicationFactory<Program>) even though it works fine when the app runs normally — wiring
// the sinks in code sidesteps it since the compiler then forces those assemblies to be copied
// wherever Heliograph.Api is referenced. FromLogContext is what makes TraceId/GameId scopes set via
// ILogger.BeginScope (see GamesController/GameService) surface as log event properties on both.
builder.Host.UseSerilog((context, services, loggerConfig) => loggerConfig
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console(new Serilog.Formatting.Compact.CompactJsonFormatter())
    .WriteTo.File(
        new Serilog.Formatting.Compact.CompactJsonFormatter(),
        "logs/heliograph-api-.log",
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 14));

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

builder.Services.AddDbContext<HeliographDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("HeliographDb")));

// The BCL clock abstraction, not a custom interface — GameService takes this instead of calling
// DateTime.UtcNow directly, so tests can substitute Microsoft.Extensions.Time.Testing's
// FakeTimeProvider (see IntegrationFixture) for deterministic clock-expiry assertions.
builder.Services.AddSingleton(TimeProvider.System);

builder.Services.AddScoped<GameService>();
// GameService's collaborators. GameEndService MUST be AddScoped: it mutates the tracked Game +
// AspNetUsers rows inside the transaction GameService opened, so it has to resolve the same
// per-request HeliographDbContext — a Singleton/Transient-with-its-own-context registration would break
// single-transaction atomicity with every test still green. GameClockLifecycle is stateless but
// registered the same way for consistency. The DI-lifetime guard test asserts both stay Scoped.
builder.Services.AddScoped<GameClockLifecycle>();
builder.Services.AddScoped<GameEndService>();
builder.Services.AddScoped<GameResponseMapper>();
// BotService holds no DbContext/state at all — it's registered AddScoped anyway, matching every
// other GameService collaborator, so a future stateful change to it doesn't silently need a second
// DI-lifetime audit.
builder.Services.AddScoped<BotService>();
// Rooms / seating — shares only GameHelpers + GameClockLifecycle with the move flow. AddScoped
// so JoinRoomAsync's own transaction runs on the request HeliographDbContext, same as GameService's.
builder.Services.AddScoped<RoomService>();
builder.Services.AddScoped<LeaderboardService>();

// User search + friend requests. AddScoped for the same reason as RoomService: it mutates tracked
// Friendship/AspNetUsers rows on the request HeliographDbContext.
builder.Services.AddScoped<FriendService>();

// Match invites (plan 07-friend-invites-matches.md). AddScoped for the same reason as RoomService,
// which it depends on directly — AcceptAsync's transaction must resolve the same request
// HeliographDbContext RoomService.CreateGameWithCodeAsync writes through.
builder.Services.AddScoped<InviteService>();

// The /api/admin surface. AddScoped for the same reason as GameEndService (which it depends on):
// it mutates tracked Game / AspNetUsers rows and must resolve the request HeliographDbContext. The
// DI-lifetime guard test (api.tests/Services/ServiceRegistrationTests.cs) asserts it stays Scoped.
builder.Services.AddScoped<AdminService>();

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
    .AddEntityFrameworkStores<HeliographDbContext>();

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection(AdminOptions.SectionName));
builder.Services.Configure<RateLimitOptions>(builder.Configuration.GetSection(RateLimitOptions.SectionName));

// The only rate limit in the app, on the only endpoint that needs one: POST /api/auth/login is the
// entire unauthenticated write surface (no self-registration — see AuthController's doc comment),
// and Identity's own lockout never fires here because AuthService.LoginAsync calls
// UserManager.CheckPasswordAsync directly rather than going through SignInManager, so nothing
// increments AccessFailedCount. A fixed window per client IP is the whole in-app mechanism; per-
// account lockout is deliberately not added (owner decision, 2026-09-23) — a Cloudflare edge rule
// and Cloudflare Access in front of /api/admin/* cover the distributed case instead, without handing
// anyone a way to lock a named account out.
//
// Partitioned on RemoteIpAddress, which UseForwardedHeaders below has already rewritten from
// X-Forwarded-For. infra/Caddyfile *replaces* that header with its resolved {client_ip}: the peer
// itself, or CF-Connecting-IP when the peer is cloudflared's reserved address. So this is the real
// client both on the LAN and behind the tunnel, and a forged inbound header can't pick its own
// partition. Never read CF-Connecting-IP here directly — Caddy passes it through from any peer, so
// only Caddy's trust check makes it meaningful. See GOTCHAS.md.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // Matches the AuthError/MoveError wire shape ({"error": "..."}) the frontend's readError()
    // already parses, so a 429 renders as a real message instead of a bare status code.
    options.OnRejected = async (context, ct) =>
    {
        // The limiter is the brute-force reaction; this line is how anyone finds out it fired.
        context.HttpContext.RequestServices.GetRequiredService<ILogger<Program>>().LogWarning(
            "login rate limit hit from {ClientIp}", context.HttpContext.Connection.RemoteIpAddress?.ToString());
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsync(
            """{"error":"too many login attempts, try again later"}""", ct);
    };
    options.AddPolicy(RateLimitOptions.LoginPolicy, httpContext =>
    {
        var limits = httpContext.RequestServices.GetRequiredService<IOptions<RateLimitOptions>>().Value;
        // A null RemoteIpAddress (in-memory TestServer, a unix socket) all shares one bucket rather
        // than getting a free pass each — fail closed, not open.
        var clientIp = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(clientIp, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = limits.LoginPermitLimit,
            Window = TimeSpan.FromSeconds(limits.LoginWindowSeconds),
            // No queue: a caller over budget gets an immediate 429, never a held-open request.
            QueueLimit = 0,
        });
    });
});
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
// One policy: the /api/admin controller is [Authorize(Policy = "Admin")]. RequireClaim's type must
// match JwtTokenService.AdminClaimType exactly (MapInboundClaims = false, so no remapping) — hence
// the shared constant rather than a retyped literal.
builder.Services.AddAuthorization(options =>
    options.AddPolicy("Admin", policy => policy.RequireClaim(JwtTokenService.AdminClaimType, "true")));

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

// After UseForwardedHeaders so the login limiter partitions on the real client IP rather than
// Caddy's, and before the auth middleware because the limit exists to cap unauthenticated tries.
app.UseRateLimiter();

// The deployed container applies EF migrations on boot; local dev runs
// `dotnet ef database update` (see README), and `dotnet ef` design-time builds run
// as Development so they skip this too. compose waits for the db healthcheck, but
// retry anyway so a cold or briefly-restarting Postgres doesn't kill the container.
if (app.Environment.IsProduction())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
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

// First-admin bootstrap: flip the AdminOptions.BootstrapEmail account to IsAdmin = true. Idempotent
// (a no-op once it's already set), runs every boot in every environment except Testing (integration
// tests manage admin state directly). Non-fatal — a design-time `dotnet ef` invocation or a
// not-yet-migrated dev DB just logs a warning and continues.
if (!app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var bootstrapEmail = scope.ServiceProvider.GetRequiredService<IOptions<AdminOptions>>().Value.BootstrapEmail?.Trim();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    if (!string.IsNullOrEmpty(bootstrapEmail))
    {
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
            var flipped = await db.Database.ExecuteSqlInterpolatedAsync(
                $"""UPDATE "AspNetUsers" SET "IsAdmin" = true WHERE lower("Email") = lower({bootstrapEmail}) AND "IsAdmin" = false""");
            if (flipped > 0)
                logger.LogInformation("Admin bootstrap: granted admin to {Email}", bootstrapEmail);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Admin bootstrap for {Email} skipped (DB unavailable or not migrated)", bootstrapEmail);
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
