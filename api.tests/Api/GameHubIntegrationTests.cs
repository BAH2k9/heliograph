using Khet.Api.Data;
using Khet.Contracts;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using System.Text.Json;

namespace Khet.Api.Tests.Api;

/// <summary>
/// The realtime pipe: a move submitted over REST by one client is broadcast over the hub to
/// every other client in that game's group. REST stays the source of truth; this only checks
/// the fan-out. Uses long-polling over the in-memory <see cref="Microsoft.AspNetCore.TestHost.TestServer"/>
/// handler — TestServer's raw-WebSocket plumbing isn't worth fighting for a delivery assertion.
/// Skips (doesn't fail) when no Postgres is reachable.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class GameHubIntegrationTests(IntegrationFixture fixture)
{
    // A known-legal, uneventful P1 opening (see GamesEndpointIntegrationTests): (2,3) -> (2,4).
    private static readonly SubmitMoveRequest QuietOpening =
        new("move", new CoordDto(2, 3), new CoordDto(2, 4), null);

    // Games/the hub are auth-only now (guest play is gone) — these tests are about fan-out
    // mechanics, not identity, so each helper registers its own throwaway account.
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var client = fixture.Factory.CreateClient();
        var auth = fixture.RegisterAsync().GetAwaiter().GetResult();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    private HubConnection NewHubConnection()
    {
        var server = fixture.Factory.Server;
        var auth = fixture.RegisterAsync().GetAwaiter().GetResult();
        // Default JSON hub protocol: camelCase names, matching the frontend wire types. Every
        // enum-valued field on the contract DTOs is already a string, so no converter is needed.
        return new HubConnectionBuilder()
            .WithUrl(new Uri(server.BaseAddress, "api/hub"), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();
                options.AccessTokenProvider = () => Task.FromResult<string?>(auth.AccessToken);
            })
            .Build();
    }

    private async Task<Guid> CreateGameAsync(HttpClient client)
    {
        var res = await client.PostAsync("/api/games", content: null);
        res.EnsureSuccessStatusCode();
        var game = await res.Content.ReadFromJsonAsync<GameResponse>();
        return game!.Id;
    }

    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();

    private static KhetDbContext Db(AsyncServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<KhetDbContext>();

    [SkippableFact]
    public async Task Move_over_rest_is_broadcast_to_another_client_in_the_same_group()
    {
        var client = NewClient();
        var gameId = await CreateGameAsync(client);

        await using var mover = NewHubConnection();
        await using var watcher = NewHubConnection();
        await mover.StartAsync();
        await watcher.StartAsync();
        await mover.InvokeAsync("Join", gameId.ToString(), null);
        await watcher.InvokeAsync("Join", gameId.ToString(), null);

        // Capture the raw JSON: SignalR's C# client is case-insensitive, so a typed handler
        // would pass whether the server emits camelCase or PascalCase. The JS client
        // (web/src/api/types.ts) is case-sensitive — pin the exact property names it reads.
        var received = new TaskCompletionSource<JsonElement>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.On<JsonElement>("moveApplied", msg => received.TrySetResult(msg));

        var traceId = Guid.NewGuid().ToString();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/games/{gameId}/moves")
        {
            Content = JsonContent.Create(QuietOpening),
        };
        request.Headers.Add("X-Trace-Id", traceId);
        var post = await client.SendAsync(request);
        post.EnsureSuccessStatusCode();

        var completed = await Task.WhenAny(received.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == received.Task, "watcher did not receive the move broadcast within 5s");

        var payload = await received.Task;
        Assert.Equal(1, payload.GetProperty("moveNumber").GetInt32());
        Assert.Equal("P2", payload.GetProperty("currentTurn").GetString());
        Assert.Equal("InProgress", payload.GetProperty("status").GetString());
        Assert.True(payload.TryGetProperty("laserSegments", out _));
        Assert.True(payload.TryGetProperty("eliminated", out _));
        Assert.True(payload.TryGetProperty("damaged", out _));
        // The X-Trace-Id sent on the REST call arrives unchanged in the moveApplied broadcast —
        // end-to-end proof of the correlation-id requirement (backlog/10-bug-traceability.md).
        Assert.Equal(traceId, payload.GetProperty("traceId").GetString());

        var pieces = payload.GetProperty("boardState").GetProperty("pieces").EnumerateArray().ToList();
        Assert.Equal(24, pieces.Count);
        // The moved piece is at its destination, enum-valued fields arriving as the strings
        // the frontend mirror expects.
        var moved = pieces.Single(p => p.GetProperty("row").GetInt32() == 2 && p.GetProperty("col").GetInt32() == 4);
        Assert.Equal("Pyramid", moved.GetProperty("kind").GetString());
        Assert.Equal("P1", moved.GetProperty("owner").GetString());
    }

    [SkippableFact]
    public async Task Broadcast_does_not_reach_a_client_in_a_different_game_group()
    {
        var client = NewClient();
        var gameA = await CreateGameAsync(client);
        var gameB = await CreateGameAsync(client);

        await using var watcherB = NewHubConnection();
        await watcherB.StartAsync();
        await watcherB.InvokeAsync("Join", gameB.ToString(), null);

        var leaked = new TaskCompletionSource<SubmitMoveResponse>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        watcherB.On<SubmitMoveResponse>("moveApplied", msg => leaked.TrySetResult(msg));

        var post = await client.PostAsJsonAsync($"/api/games/{gameA}/moves", QuietOpening);
        post.EnsureSuccessStatusCode();

        var completed = await Task.WhenAny(leaked.Task, Task.Delay(TimeSpan.FromSeconds(2)));
        Assert.True(completed != leaked.Task, "watcher in game B received a broadcast for game A");
    }

    [SkippableFact]
    public async Task Disconnecting_a_tracked_seat_stamps_DisconnectedAtUtc_and_broadcasts_it()
    {
        var client = NewClient();
        var gameId = await CreateGameAsync(client);

        // A separate watcher, joined without a seat, both keeps a live group member around (so
        // the broadcast has somewhere to land) and lets the test synchronize on the event itself
        // rather than polling the DB for OnDisconnectedAsync's async work to land.
        await using var watcher = NewHubConnection();
        await watcher.StartAsync();
        await watcher.InvokeAsync("Join", gameId.ToString(), null);

        var received = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.On<JsonElement>("opponentDisconnected", msg => received.TrySetResult(msg));

        var mover = NewHubConnection();
        await mover.StartAsync();
        await mover.InvokeAsync("Join", gameId.ToString(), "P1");
        await mover.StopAsync();
        await mover.DisposeAsync();

        var completed = await Task.WhenAny(received.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == received.Task, "watcher did not receive opponentDisconnected within 5s");

        var payload = await received.Task;
        Assert.Equal("P1", payload.GetProperty("seat").GetString());
        Assert.True(payload.TryGetProperty("disconnectedAtUtc", out _));

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == gameId);
        Assert.NotNull(row.P1DisconnectedAtUtc);
    }

    [SkippableFact]
    public async Task Joining_a_seat_for_the_first_time_broadcasts_opponentJoined_to_the_rest_of_the_group()
    {
        var client = NewClient();
        var gameId = await CreateGameAsync(client);

        // The host is already in the group, seated as P1.
        await using var host = NewHubConnection();
        await host.StartAsync();
        await host.InvokeAsync("Join", gameId.ToString(), "P1");

        var received = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        host.On<JsonElement>("opponentJoined", msg => received.TrySetResult(msg));

        // A fresh join by the same connection must not echo the event back to itself (GroupExcept).
        var selfEcho = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);

        await using var joiner = NewHubConnection();
        joiner.On<JsonElement>("opponentJoined", msg => selfEcho.TrySetResult(msg));
        await joiner.StartAsync();
        await joiner.InvokeAsync("Join", gameId.ToString(), "P2");

        var completed = await Task.WhenAny(received.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == received.Task, "host did not receive opponentJoined within 5s");
        Assert.Equal("P2", (await received.Task).GetProperty("seat").GetString());

        var echoed = await Task.WhenAny(selfEcho.Task, Task.Delay(TimeSpan.FromSeconds(1)));
        Assert.True(echoed != selfEcho.Task, "the joining connection received its own opponentJoined echo");
    }

    [SkippableFact]
    public async Task Rejoining_with_the_same_seat_clears_the_tracked_disconnect_and_broadcasts_reconnect()
    {
        var client = NewClient();
        var gameId = await CreateGameAsync(client);

        await using var watcher = NewHubConnection();
        await watcher.StartAsync();
        await watcher.InvokeAsync("Join", gameId.ToString(), null);

        var disconnected = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var reconnected = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.On<JsonElement>("opponentDisconnected", msg => disconnected.TrySetResult(msg));
        watcher.On<JsonElement>("opponentReconnected", msg => reconnected.TrySetResult(msg));

        var mover = NewHubConnection();
        await mover.StartAsync();
        await mover.InvokeAsync("Join", gameId.ToString(), "P1");
        await mover.StopAsync();
        await mover.DisposeAsync();

        // Wait for the disconnect to actually land before rejoining, so ClearDisconnectedAsync
        // has something real to clear (and not a race against OnDisconnectedAsync's own write).
        var disconnectCompleted = await Task.WhenAny(disconnected.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(disconnectCompleted == disconnected.Task, "watcher did not observe the initial disconnect");

        await using var rejoined = NewHubConnection();
        await rejoined.StartAsync();
        await rejoined.InvokeAsync("Join", gameId.ToString(), "P1");

        var reconnectCompleted = await Task.WhenAny(reconnected.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(reconnectCompleted == reconnected.Task, "watcher did not receive opponentReconnected within 5s");

        var payload = await reconnected.Task;
        Assert.Equal("P1", payload.GetProperty("seat").GetString());

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == gameId);
        Assert.Null(row.P1DisconnectedAtUtc);
    }
}
