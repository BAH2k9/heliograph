using Khet.Api.Data;
using Khet.Api.Services;
using Khet.Api.Tests.Api;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Khet.Api.Tests.Services;

/// <summary>
/// The GameService decomposition's single-transaction atomicity claim rests on every game-flow
/// collaborator resolving the <em>same</em> per-request <c>KhetDbContext</c> as <c>GameService</c> —
/// i.e. all of them <em>and the context itself</em> being registered <c>AddScoped</c>. A stray
/// <c>AddSingleton</c> / <c>AddTransient</c>-with-its-own-context registration (including the
/// <c>contextLifetime</c> overload of <c>AddDbContext</c>) would break atomicity while leaving every
/// behavioural test green, so this guards the DI lifetimes directly. No Postgres — it only inspects
/// the service collection, never opens a connection.
/// </summary>
public class ServiceRegistrationTests
{
    [Theory]
    [InlineData(typeof(KhetDbContext))]
    [InlineData(typeof(GameService))]
    [InlineData(typeof(GameClockLifecycle))]
    [InlineData(typeof(GameEndService))]
    [InlineData(typeof(GameResponseMapper))]
    [InlineData(typeof(RoomService))]
    // AdminService mutates tracked Game / AspNetUsers rows and calls into GameEndService — same
    // shared-context requirement, so it must stay Scoped too.
    [InlineData(typeof(AdminService))]
    // FriendService mutates tracked Friendship / AspNetUsers rows on the request context — same reasoning.
    [InlineData(typeof(FriendService))]
    // InviteService.AcceptAsync calls into RoomService.CreateGameWithCodeAsync and GameClockLifecycle
    // inside its own transaction — same shared-context requirement.
    [InlineData(typeof(InviteService))]
    public void Game_flow_services_are_registered_scoped(Type serviceType)
    {
        var services = CaptureServiceCollection();

        // DI is last-wins, so the effective registration is the last descriptor for the type.
        var matches = services.Where(d => d.ServiceType == serviceType).ToList();
        Assert.NotEmpty(matches);
        Assert.Equal(ServiceLifetime.Scoped, matches[^1].Lifetime);
    }

    private static IServiceCollection CaptureServiceCollection()
    {
        using var factory = new IntegrationFixture.ApiFactory();
        IServiceCollection? captured = null;
        using var configured = factory.WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services => captured = services));
        _ = configured.Services; // forces the host to build, which runs the callback above
        return captured!;
    }
}
