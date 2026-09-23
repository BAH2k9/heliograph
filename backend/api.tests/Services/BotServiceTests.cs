using Heliograph.Api.Services;
using Heliograph.Api.Tests.Api;
using Heliograph.Contracts;
using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Api.Tests.Services;

/// <summary>
/// Pure unit tests of <see cref="BotService.ChooseMove"/> — no DB, no HTTP. Builds small boards
/// with the shared <c>TestBoard</c> helper (see its own doc comment on why this is a narrower copy
/// of the one in <c>Heliograph.Engine.Tests</c>).
/// </summary>
public class BotServiceTests
{
    private readonly BotService _bot = new();

    [Theory]
    [InlineData("Easy")]
    [InlineData("Medium")]
    [InlineData("Hard")]
    public void Always_returns_a_legal_move(string difficultyName)
    {
        var board = GameEngine.CreateStartingBoard();
        var difficulty = BotDifficulties.For(difficultyName);

        for (var i = 0; i < 10; i++)
        {
            var move = _bot.ChooseMove(board, Player.P1, RuleSets.Classic, difficulty);
            var legal = GameEngine.LegalMoves(board, Player.P1, RuleSets.Classic);
            Assert.Contains(legal, m => m == move);
        }
    }

    /// <summary>
    /// A constructed position where the bot's own obelisk is the only thing blocking P2's fixed
    /// corner laser (column 0) from the bot's own pharaoh, also parked in that column. Moving the
    /// obelisk away exposes the pharaoh to a forced loss on P2's very next move (P2's laser fires
    /// automatically off <em>any</em> move, not just one aimed at the pharaoh) — moving the pharaoh
    /// itself out of the column (or leaving the obelisk in place) does not. Every difficulty should
    /// avoid the obelisk moves.
    /// </summary>
    private static Board HangingPharaohBoard() => TestBoard.With(
        (new Coord(5, 0), TestBoard.Pharaoh()),
        (new Coord(2, 0), TestBoard.Obelisk(health: 1)),
        (new Coord(3, 5), TestBoard.Pharaoh(Player.P2)));

    [Theory]
    [InlineData("Easy")]
    [InlineData("Medium")]
    [InlineData("Hard")]
    public void Avoids_a_move_that_immediately_hangs_its_own_pharaoh(string difficultyName)
    {
        var board = HangingPharaohBoard();
        var difficulty = BotDifficulties.For(difficultyName);

        for (var i = 0; i < 10; i++)
        {
            var move = _bot.ChooseMove(board, Player.P1, RuleSets.Classic, difficulty);
            Assert.Equal(new Coord(5, 0), move.From); // the pharaoh — never the blocking obelisk
        }
    }

    [Theory]
    [InlineData("Medium")]
    [InlineData("Hard")]
    public void Prefers_a_move_that_wins_outright_over_one_that_does_not(string difficultyName)
    {
        // P1's laser always fires from the fixed (7,9) corner emitter (no Sphinx on this board —
        // LaserSourceFor falls back to it). A Pyramid sits right on that emitter, initially NW —
        // rotating it CCW to SW (Orientation cycles NW,NE,SE,SW; CCW from NW wraps to SW in one
        // step, per GameEngine.Rotate) reflects the beam Left along row 7 (LaserReflection.Pyramid
        // keys on the entering edge, which for straight-Up travel is Down: (Down, SW) -> Left) —
        // a clear shot straight into P2's undefended pharaoh at (7,4), ending the game this move.
        // Every other legal move (shifting the pyramid away, rotating it any other way, or moving
        // the P1 pharaoh) leaves the position merely InProgress or worse. Medium/Hard's minimax
        // must find the one move that wins outright.
        var board = TestBoard.With(
            (new Coord(5, 5), TestBoard.Pharaoh()),
            (new Coord(7, 9), TestBoard.Pyramid(Orientation.NW)),
            (new Coord(7, 4), TestBoard.Pharaoh(Player.P2)));

        var difficulty = BotDifficulties.For(difficultyName);
        var move = new BotService().ChooseMove(board, Player.P1, RuleSets.Classic, difficulty);

        Assert.Equal(EngineMove.Turn(new Coord(7, 9), RotationDir.CCW), move);
    }
}
