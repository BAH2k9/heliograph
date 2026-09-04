using System.Net.Http.Json;
using System.Text.Json;
using Khet.Api.Contracts;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;

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

    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private HubConnection NewHubConnection()
    {
        var server = fixture.Factory.Server;
        // Default JSON hub protocol: camelCase names, matching the frontend wire types. Every
        // enum-valued field on the contract DTOs is already a string, so no converter is needed.
        return new HubConnectionBuilder()
            .WithUrl(new Uri(server.BaseAddress, "api/hub"), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();
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

    [SkippableFact]
    public async Task Move_over_rest_is_broadcast_to_another_client_in_the_same_group()
    {
        var client = NewClient();
        var gameId = await CreateGameAsync(client);

        await using var mover = NewHubConnection();
        await using var watcher = NewHubConnection();
        await mover.StartAsync();
        await watcher.StartAsync();
        await mover.InvokeAsync("Join", gameId.ToString());
        await watcher.InvokeAsync("Join", gameId.ToString());

        // Capture the raw JSON: SignalR's C# client is case-insensitive, so a typed handler
        // would pass whether the server emits camelCase or PascalCase. The JS client
        // (web/src/api/types.ts) is case-sensitive — pin the exact property names it reads.
        var received = new TaskCompletionSource<JsonElement>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.On<JsonElement>("moveApplied", msg => received.TrySetResult(msg));

        var post = await client.PostAsJsonAsync($"/api/games/{gameId}/moves", QuietOpening);
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
        await watcherB.InvokeAsync("Join", gameB.ToString());

        var leaked = new TaskCompletionSource<SubmitMoveResponse>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        watcherB.On<SubmitMoveResponse>("moveApplied", msg => leaked.TrySetResult(msg));

        var post = await client.PostAsJsonAsync($"/api/games/{gameA}/moves", QuietOpening);
        post.EnsureSuccessStatusCode();

        var completed = await Task.WhenAny(leaked.Task, Task.Delay(TimeSpan.FromSeconds(2)));
        Assert.True(completed != leaked.Task, "watcher in game B received a broadcast for game A");
    }
}
