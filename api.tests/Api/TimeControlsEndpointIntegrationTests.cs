using System.Net;
using System.Net.Http.Json;
using Khet.Api.Contracts;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of BE-2: room creation accepting a time control, clock initialization at
/// seat-fill (not room creation), and the new wire fields on <c>GameResponse</c>/
/// <c>SubmitMoveResponse</c>. No timeout enforcement yet (that's BE-3) — these only check the
/// wire contract and the clock-initialization moment. Skips (doesn't fail) when no Postgres.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class TimeControlsEndpointIntegrationTests(IntegrationFixture fixture)
{
    private static readonly SubmitMoveRequest QuietOpening =
        new("move", new CoordDto(2, 3), new CoordDto(2, 4), null);

    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private static async Task<RoomResponse> CreateRoomAsync(HttpClient client, string? timeControl = null)
    {
        var res = timeControl is null
            ? await client.PostAsync("/api/rooms", content: null)
            : await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(TimeControl: timeControl));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    [SkippableFact]
    public async Task An_untimed_room_has_null_clock_fields_but_a_present_serverNowUtc()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client);

        var game = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");

        Assert.Null(game!.TimeControl);
        Assert.Null(game.P1RemainingMs);
        Assert.Null(game.P2RemainingMs);
        Assert.Null(game.TurnStartedAtUtc);
        Assert.Null(game.TurnDeadlineUtc);
        Assert.False(game.TimedOut);
        // ServerNowUtc is always present, even for an untimed game.
        Assert.True(game.ServerNowUtc > DateTime.MinValue);
    }

    [SkippableFact]
    public async Task Creating_a_room_with_an_unknown_time_control_is_a_400()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(TimeControl: "bogus"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("bogus", error!.Error);
    }

    [SkippableFact]
    public async Task A_timed_room_does_not_start_its_clock_until_the_second_seat_is_filled()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client, "3+2");

        // Only P1 seated so far — the preset name is recorded, but per the plan the clock itself
        // (remaining time / deadline) must not start until the room actually has two players.
        var beforeJoin = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Equal("3+2", beforeJoin!.TimeControl);
        Assert.Null(beforeJoin.P1RemainingMs);
        Assert.Null(beforeJoin.P2RemainingMs);
        Assert.Null(beforeJoin.TurnStartedAtUtc);
        Assert.Null(beforeJoin.TurnDeadlineUtc);

        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var afterJoin = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Equal(180_000, afterJoin!.P1RemainingMs);
        Assert.Equal(180_000, afterJoin.P2RemainingMs);
        Assert.NotNull(afterJoin.TurnStartedAtUtc);
        Assert.NotNull(afterJoin.TurnDeadlineUtc);
        // Room games always start with P1 to move, so the initial deadline is P1's own 180s bank.
        Assert.Equal(TimeSpan.FromSeconds(180), afterJoin.TurnDeadlineUtc - afterJoin.TurnStartedAtUtc);
        Assert.False(afterJoin.TimedOut);
    }

    [SkippableFact]
    public async Task A_daily_room_has_no_balance_but_gets_a_days_per_move_deadline_at_seat_fill()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client, "3/move");

        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var game = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Equal("3/move", game!.TimeControl);
        Assert.Null(game.P1RemainingMs);
        Assert.Null(game.P2RemainingMs);
        Assert.NotNull(game.TurnStartedAtUtc);
        Assert.Equal(TimeSpan.FromDays(3), game.TurnDeadlineUtc - game.TurnStartedAtUtc);
    }

    [SkippableFact]
    public async Task TimedOut_is_true_once_the_deadline_has_passed_but_status_stays_inProgress()
    {
        // BE-3 owns actually ending the game on timeout; BE-2's GameResponse.TimedOut is purely
        // computed on read (Status == InProgress && now > TurnDeadlineUtc) and must not, on its
        // own, change anything.
        var client = NewClient();
        var room = await CreateRoomAsync(client, "1+0");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(61));

        var game = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.True(game!.TimedOut);
        Assert.Equal("InProgress", game.Status);

        // FakeTimeProvider is monotonic (Advance rejects negative deltas) and shared across this
        // whole collection (see IntegrationFixture) — there's no "rewind" here. That's fine: every
        // other test in this file asserts relative deltas (TurnDeadlineUtc - TurnStartedAtUtc,
        // etc.), not absolute proximity to wall-clock now, so a permanently-advanced shared clock
        // doesn't affect them.
    }

    [SkippableFact]
    public async Task SubmitMoveResponse_carries_the_same_clock_fields_as_GameResponse()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client, "5+3");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var res = await client.PostAsJsonAsync(
            $"/api/games/{room.GameId}/moves", QuietOpening with { Seat = "P1" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var body = (await res.Content.ReadFromJsonAsync<SubmitMoveResponse>())!;
        Assert.Equal("5+3", body.TimeControl);
        Assert.Equal(300_000, body.P1RemainingMs);
        Assert.Equal(300_000, body.P2RemainingMs);
        Assert.NotNull(body.TurnStartedAtUtc);
        Assert.NotNull(body.TurnDeadlineUtc);
        Assert.True(body.ServerNowUtc > DateTime.MinValue);
    }

    [SkippableFact]
    public async Task A_room_created_without_a_body_at_all_stays_untimed()
    {
        // EmptyBodyBehavior.Allow on RoomsController.Create — a bare POST with no JSON body must
        // still work and default TimeControl to null, same as Ruleset/Layout already do.
        var client = NewClient();

        var res = await client.PostAsync("/api/rooms", content: null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var room = (await res.Content.ReadFromJsonAsync<RoomResponse>())!;

        var game = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Null(game!.TimeControl);
    }

    [SkippableFact]
    public async Task Direct_game_creation_never_gets_a_time_control_field_on_the_wire()
    {
        // CreateGameRequest (local play) intentionally has no TimeControl property at all —
        // confirm the endpoint still 200s and the response is untimed, guarding against a future
        // accidental addition of the field to that request type.
        var client = NewClient();

        var res = await client.PostAsync("/api/games", content: null);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;
        Assert.Null(game.TimeControl);
    }

    [SkippableFact]
    public async Task Spectators_joining_after_both_seats_are_filled_do_not_restart_the_clock()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client, "10+0");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var afterSecondSeat = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        var turnStartedAtFirstFill = afterSecondSeat!.TurnStartedAtUtc;

        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(5));
        var spectatorJoin = await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        var spectatorBody = (await spectatorJoin.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.Equal("Spectator", spectatorBody.Seat);

        var afterSpectator = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Equal(turnStartedAtFirstFill, afterSpectator!.TurnStartedAtUtc);
    }
}
