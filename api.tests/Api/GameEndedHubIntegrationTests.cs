using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Khet.Api.Contracts;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;

namespace Khet.Api.Tests.Api;

/// <summary>
/// The realtime side of BE-3: a timeout resolved either by <c>claim-timeout</c> or by a submitted
/// move arriving after expiry must broadcast <c>gameEnded</c> — deliberately not <c>moveApplied</c>,
/// since <c>applyRemoteMove</c>'s <c>moveNumber &lt;= moveCount</c> guard would silently drop a
/// synthetic <c>moveApplied</c> here (no move was ever applied). Same long-polling approach as
/// <see cref="GameHubIntegrationTests"/>. Skips (doesn't fail) when no Postgres is reachable.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class GameEndedHubIntegrationTests(IntegrationFixture fixture)
{
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
        return new HubConnectionBuilder()
            .WithUrl(new Uri(server.BaseAddress, "api/hub"), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();
            })
            .Build();
    }

    private static async Task<RoomResponse> CreateTimedRoomAsync(HttpClient client, string timeControl)
    {
        var res = await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(TimeControl: timeControl));
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    [SkippableFact]
    public async Task Claim_timeout_broadcasts_gameEnded_to_the_games_group()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "1+0");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(61));

        await using var watcher = NewHubConnection();
        await watcher.StartAsync();
        await watcher.InvokeAsync("Join", room.GameId.ToString(), null);

        var received = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.On<JsonElement>("gameEnded", msg => received.TrySetResult(msg));

        var claim = await client.PostAsync($"/api/games/{room.GameId}/claim-timeout", content: null);
        claim.EnsureSuccessStatusCode();

        var completed = await Task.WhenAny(received.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == received.Task, "watcher did not receive the gameEnded broadcast within 5s");

        var payload = await received.Task;
        Assert.Equal("P2Win", payload.GetProperty("status").GetString());
        Assert.Equal("Timeout", payload.GetProperty("endReason").GetString());
        Assert.True(payload.TryGetProperty("serverNowUtc", out _));
    }

    [SkippableFact]
    public async Task An_expired_move_submission_broadcasts_gameEnded_not_moveApplied()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "1+0");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(61));

        await using var watcher = NewHubConnection();
        await watcher.StartAsync();
        await watcher.InvokeAsync("Join", room.GameId.ToString(), null);

        var gameEnded = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var moveApplied = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.On<JsonElement>("gameEnded", msg => gameEnded.TrySetResult(msg));
        watcher.On<JsonElement>("moveApplied", msg => moveApplied.TrySetResult(msg));

        var post = await client.PostAsJsonAsync(
            $"/api/games/{room.GameId}/moves", QuietOpening with { Seat = "P1" });
        Assert.Equal(HttpStatusCode.Conflict, post.StatusCode); // expired -> 409, move never applied

        var completed = await Task.WhenAny(gameEnded.Task, moveApplied.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == gameEnded.Task, "watcher did not receive the gameEnded broadcast within 5s");
        Assert.False(moveApplied.Task.IsCompleted, "watcher should never see moveApplied for a timed-out submission");

        var payload = await gameEnded.Task;
        Assert.Equal("P2Win", payload.GetProperty("status").GetString());
        Assert.Equal("Timeout", payload.GetProperty("endReason").GetString());
    }

    [SkippableFact]
    public async Task Resign_broadcasts_gameEnded_to_the_games_group()
    {
        var client = NewClient();
        var res = await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest());
        res.EnsureSuccessStatusCode();
        var room = (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        await using var watcher = NewHubConnection();
        await watcher.StartAsync();
        await watcher.InvokeAsync("Join", room.GameId.ToString(), (string?)null);

        var received = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        watcher.On<JsonElement>("gameEnded", msg => received.TrySetResult(msg));

        var resign = await client.PostAsJsonAsync($"/api/games/{room.GameId}/resign", new ResignRequest("P1"));
        resign.EnsureSuccessStatusCode();

        var completed = await Task.WhenAny(received.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == received.Task, "watcher did not receive the gameEnded broadcast within 5s");

        var payload = await received.Task;
        Assert.Equal("P2Win", payload.GetProperty("status").GetString());
        Assert.Equal("Resignation", payload.GetProperty("endReason").GetString());
        Assert.True(payload.TryGetProperty("serverNowUtc", out _));
    }
}
