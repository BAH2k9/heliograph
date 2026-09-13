using Khet.Api.Mapping;
using Khet.Contracts;
using Khet.Engine;
using Khet.Engine.Enums;
using Microsoft.Extensions.Logging;
using static Khet.Api.Services.GameHelpers;

namespace Khet.Api.Services;

// Bot game creation. Its own partial file per the existing per-cluster split (GameService.*.cs) —
// keeps the "how a bot game starts" concern separate from SubmitMoveAsync's "how a bot's mid-game
// reply happens" (GameService.SubmitMove.cs), even though both end up calling the same
// ApplyAndPersistAsync helper defined there.
public sealed partial class GameService
{
    /// <summary>
    /// Creates a new game with one seat played by the server. Always untimed, unrated and
    /// anonymous (<see cref="Game.BotSeat"/>'s doc comment) — never a <c>JoinCode</c> room. If the
    /// bot's seat is P1 (games always start P1-to-move), its opening move is computed and applied
    /// before this returns, through the exact same apply/persist path a human's move takes
    /// (<see cref="ApplyAndPersistAsync"/>) — no artificial "thinking" delay here, unlike the
    /// mid-game bot reply in <see cref="SubmitMoveAsync"/>: there is no prior "your move" beat for
    /// the delay to pace against when the bot is the very first mover.
    /// </summary>
    public async Task<GameResponse> CreateBotGameAsync(CreateBotGameRequest request, CancellationToken ct = default)
    {
        var difficulty = BotDifficulties.For(request.Difficulty);
        var (ruleset, layout) = Resolve(request.Ruleset, request.Layout);
        var humanSeat = ResolvePlayerSeat(request.PlayerSeat);
        var botSeat = Other(humanSeat);

        var now = Now();
        var game = NewGame(ruleset, layout, now);
        game.BotSeat = botSeat;
        game.BotDifficulty = difficulty.Name;
        db.Games.Add(game);

        if (game.BotSeat == game.CurrentTurn)
        {
            var rules = RuleSets.For(game.Ruleset);
            var board = BoardMapper.ToBoard(game.State);
            var openingMove = bot.ChooseMove(board, game.CurrentTurn, rules, difficulty);
            await ApplyAndPersistAsync(game, openingMove, game.CurrentTurn, now, ct);
            logger.LogInformation(
                "bot played opening move as {BotSeat} ({Difficulty}) on game {GameId}", botSeat, difficulty.Name, game.Id);
        }

        await db.SaveChangesAsync(ct);
        return await mapper.ToResponseAsync(game, now, ct);
    }

    /// <summary>Null/blank → P1 (the human's default seat). Throws <see cref="MoveRequestException"/> (→ 400) on an unknown name.</summary>
    private static Player ResolvePlayerSeat(string? playerSeat) =>
        string.IsNullOrWhiteSpace(playerSeat)
            ? Player.P1
            : Enum.TryParse<Player>(playerSeat.Trim(), ignoreCase: true, out var parsed)
                ? parsed
                : throw new MoveRequestException($"unknown player seat '{playerSeat}'");
}
