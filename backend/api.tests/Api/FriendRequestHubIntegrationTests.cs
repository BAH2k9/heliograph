using Heliograph.Contracts;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Heliograph.Api.Tests.Api;

/// <summary>
/// <c>POST /api/friends/requests</c> broadcasts <c>friendRequestReceived</c> to the addressee's
/// <c>user:{userId}</c> group — the bell-icon alert for an incoming friend request. Same
/// long-polling-over-TestServer approach as <see cref="InviteHubIntegrationTests"/>. Skips (doesn't
/// fail) when no Postgres is reachable.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class FriendRequestHubIntegrationTests(IntegrationFixture fixture)
{
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private static string UniqueEmail() => $"friendreqhub-{Guid.NewGuid():N}@example.com";

    private Task<AuthResponse> RegisterAsync(string? displayName = null) =>
        fixture.RegisterAsync(UniqueEmail(), displayName ?? "Player" + Guid.NewGuid().ToString("N")[..6]);

    private HttpClient AuthedClient(AuthResponse auth)
    {
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    private HubConnection NewHubConnection(string accessToken)
    {
        var server = fixture.Factory.Server;
        return new HubConnectionBuilder()
            .WithUrl(new Uri(server.BaseAddress, "api/hub"), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();
                options.AccessTokenProvider = () => Task.FromResult<string?>(accessToken);
            })
            .Build();
    }

    [SkippableFact]
    public async Task Sending_a_friend_request_broadcasts_friendRequestReceived_to_the_addressee_only()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var requesterAuth = await RegisterAsync("Requester");
        var addresseeAuth = await RegisterAsync("Addressee");
        var bystanderAuth = await RegisterAsync("Bystander");
        var requesterClient = AuthedClient(requesterAuth);

        await using var addresseeConnection = NewHubConnection(addresseeAuth.AccessToken);
        await using var bystanderConnection = NewHubConnection(bystanderAuth.AccessToken);
        await addresseeConnection.StartAsync();
        await bystanderConnection.StartAsync();
        await addresseeConnection.InvokeAsync("SubscribeToUser");
        await bystanderConnection.InvokeAsync("SubscribeToUser");

        var received = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        addresseeConnection.On<JsonElement>("friendRequestReceived", msg => received.TrySetResult(msg));
        var leaked = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        bystanderConnection.On<JsonElement>("friendRequestReceived", msg => leaked.TrySetResult(msg));

        var sendRes = await requesterClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(addresseeAuth.User.Id));
        sendRes.EnsureSuccessStatusCode();

        var completed = await Task.WhenAny(received.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == received.Task, "addressee did not receive friendRequestReceived within 5s");

        var bystanderCompleted = await Task.WhenAny(leaked.Task, Task.Delay(TimeSpan.FromSeconds(2)));
        Assert.True(bystanderCompleted != leaked.Task, "a user not addressed by the request received friendRequestReceived");
    }

    /// <summary>
    /// The implicit-accept case (<see cref="Services.FriendService"/>'s own doc comment: B asking A
    /// while A→B is already pending completes the friendship instead of creating a second pending
    /// row) has no pending request left for anyone to be notified about — so it must NOT push
    /// <c>friendRequestReceived</c>.
    /// </summary>
    [SkippableFact]
    public async Task An_implicit_accept_does_not_broadcast_friendRequestReceived()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var aliceAuth = await RegisterAsync("Alice");
        var bobAuth = await RegisterAsync("Bob");
        var aliceClient = AuthedClient(aliceAuth);
        var bobClient = AuthedClient(bobAuth);

        await aliceClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bobAuth.User.Id));

        await using var aliceConnection = NewHubConnection(aliceAuth.AccessToken);
        await aliceConnection.StartAsync();
        await aliceConnection.InvokeAsync("SubscribeToUser");
        var leaked = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        aliceConnection.On<JsonElement>("friendRequestReceived", msg => leaked.TrySetResult(msg));

        // Bob requesting Alice back completes the friendship implicitly (200, not 201).
        var res = await bobClient.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(aliceAuth.User.Id));
        var body = (await res.Content.ReadFromJsonAsync<FriendRequestCreateResponse>())!;
        Assert.Equal("accepted", body.Status);

        var completed = await Task.WhenAny(leaked.Task, Task.Delay(TimeSpan.FromSeconds(2)));
        Assert.True(completed != leaked.Task, "an implicit accept broadcast friendRequestReceived");
    }
}
