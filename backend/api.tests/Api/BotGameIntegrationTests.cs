using System.Net;
using System.Net.Http.Json;
using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Api.Services;
using Heliograph.Contracts;
using Heliograph.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Heliograph.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the bot-opponent endpoints: <c>POST /api/games/bot</c> and the bot follow-up
/// leg of <c>POST /api/games/{id}/moves</c>. Skips (doesn't fail) when no Postgres is reachable —
/// same as every other file in this folder. Zeroes <see cref="BotService.ThinkingDelayOverrideForTests"/>
/// so these don't eat a real 0.5-1.5s wait per bot move.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class BotGameIntegrationTests(IntegrationFixture fixture)
{
    // A known-legal, uneventful P1 opening (see GamesEndpointIntegrationTests/FullTurnTests): the
    // pyramid at (4,1) steps forward to (3,1) on the default (Dawn) board.
    private static readonly SubmitMoveRequest QuietOpening =
        new("move", new CoordDto(4, 1), new CoordDto(3, 1), null);

    // Games are auth-only now (guest play is gone) — none of the tests below care about identity,
    // so this registers a fresh throwaway account under the hood.
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var client = fixture.Factory.CreateClient();
        var auth = fixture.RegisterAsync().GetAwaiter().GetResult();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();

    private static HeliographDbContext Db(AsyncServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<HeliographDbContext>();

    [SkippableFact]
    public async Task Post_games_bot_with_bot_as_p1_plays_the_opening_move_before_returning()
    {
        BotService.ThinkingDelayOverrideForTests = () => TimeSpan.Zero;
        try
        {
            var client = NewClient();

            var res = await client.PostAsJsonAsync("/api/games/bot", new CreateBotGameRequest("Easy", PlayerSeat: "P2"));

            Assert.Equal(HttpStatusCode.Created, res.StatusCode);
            var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

            Assert.Equal("P1", game.BotSeat);
            Assert.Equal("Easy", game.BotDifficulty);
            Assert.False(game.Rated);
            Assert.Null(game.TimeControl);
            Assert.Equal(1, game.MoveCount);
            Assert.Equal("P2", game.CurrentTurn); // bot's opening move already handed the turn to the human

            await using var scope = Scope();
            var moves = await Db(scope).Moves.Where(m => m.GameId == game.Id).ToListAsync();
            Assert.Single(moves);
            Assert.Equal(Player.P1, moves[0].Player);
        }
        finally
        {
            BotService.ThinkingDelayOverrideForTests = null;
        }
    }

    [SkippableFact]
    public async Task Post_games_bot_with_bot_as_p2_leaves_the_human_to_move_first()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games/bot", new CreateBotGameRequest("Easy"));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        Assert.Equal("P2", game.BotSeat); // default PlayerSeat is P1 (the human)
        Assert.Equal(0, game.MoveCount);
        Assert.Equal("P1", game.CurrentTurn);
    }

    [SkippableFact]
    public async Task A_human_move_that_hands_the_turn_to_the_bot_triggers_an_immediate_reply()
    {
        BotService.ThinkingDelayOverrideForTests = () => TimeSpan.Zero;
        try
        {
            var client = NewClient();
            var createRes = await client.PostAsJsonAsync("/api/games/bot", new CreateBotGameRequest("Easy"));
            var game = (await createRes.Content.ReadFromJsonAsync<GameResponse>())!;

            var moveRes = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", QuietOpening);

            Assert.Equal(HttpStatusCode.OK, moveRes.StatusCode);
            var response = (await moveRes.Content.ReadFromJsonAsync<SubmitMoveResponse>())!;

            // The returned body is the bot's own follow-up move's outcome (post both plies) —
            // the turn is back with the human, and two moves are now on record.
            Assert.Equal("P1", response.CurrentTurn);
            Assert.Equal(2, response.MoveNumber);

            await using var scope = Scope();
            var moves = await Db(scope).Moves
                .Where(m => m.GameId == game.Id)
                .OrderBy(m => m.MoveNumber)
                .ToListAsync();
            Assert.Equal(2, moves.Count);
            Assert.Equal(Player.P1, moves[0].Player);
            Assert.Equal(Player.P2, moves[1].Player);

            var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
            Assert.Equal(Player.P1, row.CurrentTurn);
            Assert.Equal(2, row.MoveCount);
        }
        finally
        {
            BotService.ThinkingDelayOverrideForTests = null;
        }
    }

    [SkippableFact]
    public async Task Post_games_bot_with_an_unknown_difficulty_returns_400()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games/bot", new CreateBotGameRequest("Impossible"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("Impossible", error!.Error);
    }
}
