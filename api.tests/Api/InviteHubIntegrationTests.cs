using Khet.Contracts;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Khet.Api.Tests.Api;

/// <summary>
/// The first non-game-scoped hub group (<c>user:{userId}</c>, see <c>GameHub</c>'s doc comment):
/// <c>POST /api/invites</c> broadcasts <c>inviteReceived</c> to it, and only a connection that has
/// called <see cref="Khet.Api.Hubs.GameHub.SubscribeToUser"/> for that exact user is in the group.
/// Same long-polling-over-TestServer approach as <c>GameHubIntegrationTests</c>. Skips (doesn't
/// fail) when no Postgres is reachable.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class InviteHubIntegrationTests(IntegrationFixture fixture)
{
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private static string UniqueEmail() => $"invitehub-{Guid.NewGuid():N}@example.com";

    private Task<AuthResponse> RegisterAsync(string? displayName = null) =>
        fixture.RegisterAsync(UniqueEmail(), displayName ?? "Player" + Guid.NewGuid().ToString("N")[..6]);

    private HttpClient AuthedClient(AuthResponse auth)
    {
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    private async Task MakeFriendsAsync(HttpClient a, AuthResponse aAuth, HttpClient b, AuthResponse bAuth)
    {
        await a.PostAsJsonAsync("/api/friends/requests", new FriendRequestCreate(bAuth.User.Id));
        var incoming = (await b.GetFromJsonAsync<List<FriendRequestSummary>>("/api/friends/requests/incoming"))!;
        var mine = incoming.Single(r => r.UserId == aAuth.User.Id);
        await b.PostAsync($"/api/friends/requests/{mine.RequestId}/accept", content: null);
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
    public async Task Creating_an_invite_broadcasts_inviteReceived_to_the_invitees_user_group_only()
    {
        var inviterAuth = await RegisterAsync("Inviter");
        var inviteeAuth = await RegisterAsync("Invitee");
        var bystanderAuth = await RegisterAsync("Bystander");
        var inviterClient = AuthedClient(inviterAuth);
        var inviteeClient = AuthedClient(inviteeAuth);
        await MakeFriendsAsync(inviterClient, inviterAuth, inviteeClient, inviteeAuth);

        await using var inviteeConnection = NewHubConnection(inviteeAuth.AccessToken);
        await using var bystanderConnection = NewHubConnection(bystanderAuth.AccessToken);
        await inviteeConnection.StartAsync();
        await bystanderConnection.StartAsync();
        await inviteeConnection.InvokeAsync("SubscribeToUser");
        await bystanderConnection.InvokeAsync("SubscribeToUser");

        var received = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        inviteeConnection.On<JsonElement>("inviteReceived", msg => received.TrySetResult(msg));
        var leaked = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        bystanderConnection.On<JsonElement>("inviteReceived", msg => leaked.TrySetResult(msg));

        var sendRes = await inviterClient.PostAsJsonAsync("/api/invites",
            new MatchInviteCreateRequest(inviteeAuth.User.Id, null, null, null, Rated: false));
        sendRes.EnsureSuccessStatusCode();
        var sent = (await sendRes.Content.ReadFromJsonAsync<MatchInviteResponse>())!;

        var completed = await Task.WhenAny(received.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == received.Task, "invitee did not receive inviteReceived within 5s");
        Assert.Equal(sent.Id, received.Task.Result.GetProperty("inviteId").GetGuid());

        var bystanderCompleted = await Task.WhenAny(leaked.Task, Task.Delay(TimeSpan.FromSeconds(2)));
        Assert.True(bystanderCompleted != leaked.Task, "a user not addressed by the invite received inviteReceived");
    }

    [SkippableFact]
    public async Task Connecting_to_the_hub_without_a_token_is_rejected()
    {
        // GameHub is class-level [Authorize] now (guest play is gone) — an unauthenticated caller
        // is rejected at connect time, before it ever gets to invoke a method like SubscribeToUser.
        var server = fixture.Factory.Server;
        await using var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(server.BaseAddress, "api/hub"), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();
            })
            .Build();

        await Assert.ThrowsAsync<HttpRequestException>(() => connection.StartAsync());
    }
}
