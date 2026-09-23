using Heliograph.Api.Data;
using Heliograph.Contracts;
using Heliograph.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace Heliograph.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the rooms API: code creation, seat assignment (P1 / P2 / spectator), and
/// the optional seat enforcement on <c>POST /api/games/{id}/moves</c>. Skips when no Postgres.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class RoomsEndpointIntegrationTests(IntegrationFixture fixture)
{
    private static readonly SubmitMoveRequest QuietOpening =
        new("move", new CoordDto(4, 1), new CoordDto(3, 1), null);

    // Rooms are auth-only now (guest play is gone) — none of the tests below care about identity,
    // so this registers a fresh throwaway account under the hood.
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var client = fixture.Factory.CreateClient();
        var auth = fixture.RegisterAsync().GetAwaiter().GetResult();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    private static async Task<RoomResponse> CreateRoomAsync(HttpClient client)
    {
        var res = await client.PostAsync("/api/rooms", content: null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    [SkippableFact]
    public async Task Post_rooms_creates_a_game_with_a_code_and_seats_the_caller_as_p1()
    {
        var client = NewClient();

        var room = await CreateRoomAsync(client);

        Assert.Equal("P1", room.Seat);
        Assert.Equal(6, room.Code.Length);
        Assert.Matches("^[A-Z2-9]{6}$", room.Code);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
        var game = await db.Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
        Assert.Equal(room.Code, game.JoinCode);
        Assert.Equal(1, game.SeatsTaken);
        Assert.Equal(24, game.State.Pieces.Count);
    }

    [SkippableFact]
    public async Task Join_gives_p2_to_the_first_joiner_then_spectator_to_the_rest()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client);

        var first = await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var firstBody = (await first.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.Equal("P2", firstBody.Seat);
        Assert.Equal(room.GameId, firstBody.GameId);

        var second = await client.PostAsJsonAsync($"/api/rooms/{room.Code}/join", new { });
        var secondBody = (await second.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.Equal("Spectator", secondBody.Seat);

        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<HeliographDbContext>();
        var game = await db.Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
        Assert.Equal(2, game.SeatsTaken);
    }

    [SkippableFact]
    public async Task Join_with_an_unknown_code_returns_404()
    {
        var client = NewClient();

        var res = await client.PostAsync("/api/rooms/ZZZZZZ/join", content: null);

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("ZZZZZZ", error!.Error);
    }

    [SkippableFact]
    public async Task In_a_room_a_move_from_the_wrong_seat_is_rejected()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client);
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        // It's P1's turn. P2 and spectators cannot move.
        var asP2 = QuietOpening with { Seat = "P2" };
        var p2Res = await client.PostAsJsonAsync($"/api/games/{room.GameId}/moves", asP2);
        Assert.Equal(HttpStatusCode.BadRequest, p2Res.StatusCode);
        Assert.Contains("not your turn", (await p2Res.Content.ReadFromJsonAsync<MoveError>())!.Error);

        var asSpectator = QuietOpening with { Seat = "Spectator" };
        var specRes = await client.PostAsJsonAsync($"/api/games/{room.GameId}/moves", asSpectator);
        Assert.Equal(HttpStatusCode.BadRequest, specRes.StatusCode);
        Assert.Contains("spectators cannot move", (await specRes.Content.ReadFromJsonAsync<MoveError>())!.Error);
    }

    [SkippableFact]
    public async Task In_a_room_a_move_from_the_seat_whose_turn_it_is_succeeds()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client);

        var res = await client.PostAsJsonAsync(
            $"/api/games/{room.GameId}/moves", QuietOpening with { Seat = "P1" });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<SubmitMoveResponse>())!;
        Assert.Equal("P2", body.CurrentTurn);
    }

    [SkippableFact]
    public async Task A_non_room_game_ignores_the_seat_field()
    {
        var client = NewClient();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        // No JoinCode on this game, so a bogus seat is not enforced.
        var res = await client.PostAsJsonAsync(
            $"/api/games/{game.Id}/moves", QuietOpening with { Seat = "P2" });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }
}
