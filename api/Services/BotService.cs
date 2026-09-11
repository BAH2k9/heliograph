using Khet.Contracts;
using Khet.Engine;
using Khet.Engine.Enums;
using static Khet.Api.Services.GameHelpers;

namespace Khet.Api.Services;

/// <summary>
/// Picks a bot's move for a given board/difficulty. Pure-ish: deterministic given a board and
/// difficulty aside from RNG (Easy's random pick, and tie-breaking among equally-scored moves at
/// Medium/Hard) — no <c>DbContext</c>, no clock, unit-testable without a DB. Registered
/// <c>AddScoped</c> alongside <see cref="GameClockLifecycle"/>/<see cref="GameEndService"/> per the
/// existing collaborator pattern, even though it holds no per-request state, so it resolves the
/// same way every other <see cref="GameService"/> collaborator does.
///
/// <see cref="GameService.SubmitMoveAsync"/> is the only caller: after a human move flips
/// <c>Game.CurrentTurn</c> onto the bot's seat, it calls <see cref="ChooseMove"/> on the current
/// board, applies the result through the same apply/persist path a human move takes (so
/// <c>GameClockLifecycle</c>/<c>GameEndService</c> are reused for free), then awaits
/// <see cref="NextThinkingDelay"/> for pacing — never a background timer, per the claim-pattern
/// convention (this is still one synchronous request/response).
/// </summary>
public sealed class BotService
{
    // Large enough to dominate any material/threat swing (see Evaluate) but well short of
    // int.MaxValue so propagating it through a few plies of addition/negation can't overflow.
    private const int WinScore = 1_000_000;
    private const int LossScore = -WinScore;

    // Speculative "opponent could reach my pharaoh from here, right now" is worse than losing any
    // one piece but deliberately short of WinScore — it's a static threat estimate, not a proven
    // forced loss (the bot, or the opponent's own next move, may yet remove the threat).
    private const int PharaohThreatPenalty = 5_000;

    /// <summary>
    /// Test-only seam (<c>InternalsVisibleTo("Khet.Api.Tests")</c> in <c>Khet.Api.csproj</c>): when
    /// set, <see cref="NextThinkingDelay"/> draws from this instead of a real randomized 0.5-1.5s
    /// span, so integration tests don't have to eat a real wait per bot move. Null in production;
    /// reset it (in a <c>finally</c>) after use — it's process-global, same seam shape as
    /// <c>Domain.DiscriminatorAssigner.CandidateOverrideForTests</c>.
    /// </summary>
    internal static Func<TimeSpan>? ThinkingDelayOverrideForTests;

    /// <summary>The bot's artificial "thinking" pause before its move commits — see this type's own doc comment.</summary>
    public TimeSpan NextThinkingDelay() =>
        ThinkingDelayOverrideForTests?.Invoke() ?? TimeSpan.FromMilliseconds(Random.Shared.Next(500, 1501));

    /// <summary>
    /// Chooses <paramref name="toMove"/>'s move on <paramref name="board"/> for
    /// <paramref name="difficulty"/>. Throws <see cref="InvalidOperationException"/> if
    /// <paramref name="toMove"/> has no legal move at all — callers only reach this once
    /// <c>Game.Status</c> is still <c>InProgress</c>, and every piece can at minimum rotate or
    /// shift somewhere on an in-progress Khet position, so this is not expected to occur; surfacing
    /// loudly rather than silently returning a bad move is deliberate.
    /// </summary>
    public EngineMove ChooseMove(Board board, Player toMove, RuleSet ruleSet, BotDifficulty difficulty)
    {
        var legalMoves = GameEngine.LegalMoves(board, toMove, ruleSet);
        if (legalMoves.Count == 0)
            throw new InvalidOperationException($"BotService.ChooseMove: {toMove} has no legal move");

        return difficulty.Name switch
        {
            "Easy" => ChooseEasy(board, toMove, legalMoves),
            "Medium" => ChooseBest(board, toMove, ruleSet, legalMoves, replyDepth: 1),
            "Hard" => ChooseBest(board, toMove, ruleSet, legalMoves, replyDepth: 2),
            _ => throw new ArgumentOutOfRangeException(nameof(difficulty), difficulty.Name, "unknown bot difficulty"),
        };
    }

    /// <summary>
    /// Uniformly at random among legal moves — filtered down to the subset that doesn't leave
    /// <paramref name="toMove"/>'s own pharaoh immediately capturable by the opponent's laser, when
    /// such a "safe" move exists at all (falls back to the full legal set otherwise, e.g. the bot is
    /// already lost regardless of what it plays).
    /// </summary>
    private static EngineMove ChooseEasy(Board board, Player toMove, IReadOnlyList<EngineMove> legalMoves)
    {
        var safeMoves = legalMoves.Where(m => !HangsOwnPharaoh(board, toMove, m)).ToList();
        var pool = safeMoves.Count > 0 ? safeMoves : legalMoves;
        return pool[Random.Shared.Next(pool.Count)];
    }

    private static bool HangsOwnPharaoh(Board board, Player toMove, EngineMove move)
    {
        var afterLaser = PlayOut(board, move, toMove);
        if (GameEngine.CheckWin(afterLaser) != GameStatus.InProgress)
            return false; // this move itself decides the game — never "hangs" anything by definition

        var (_, opponentThreat) = GameEngine.FireLaser(afterLaser, Other(toMove));
        return opponentThreat.Termination == LaserTermination.HitPharaoh;
    }

    /// <summary>
    /// Minimax (alpha-beta pruned) over <paramref name="legalMoves"/>: for each candidate, play it
    /// out (apply + the mover's own laser fire — exactly what <see cref="GameService.SubmitMoveAsync"/>
    /// does for a real move) and score the result <paramref name="replyDepth"/> plies deeper from the
    /// opponent's reply onward. Ties broken uniformly at random so the bot doesn't play a perfectly
    /// repeatable line move to move.
    /// </summary>
    private static EngineMove ChooseBest(
        Board board, Player bot, RuleSet ruleSet, IReadOnlyList<EngineMove> legalMoves, int replyDepth)
    {
        var bestScore = int.MinValue;
        var bestMoves = new List<EngineMove>();

        foreach (var move in legalMoves)
        {
            var afterLaser = PlayOut(board, move, bot);
            var status = GameEngine.CheckWin(afterLaser);
            var score = status != GameStatus.InProgress
                ? (status == WinFor(bot) ? WinScore : LossScore)
                : Minimax(afterLaser, Other(bot), bot, ruleSet, replyDepth, int.MinValue, int.MaxValue, maximizing: false);

            if (score > bestScore)
            {
                bestScore = score;
                bestMoves.Clear();
                bestMoves.Add(move);
            }
            else if (score == bestScore)
            {
                bestMoves.Add(move);
            }
        }

        return bestMoves[Random.Shared.Next(bestMoves.Count)];
    }

    private static int Minimax(
        Board board, Player toMove, Player bot, RuleSet ruleSet, int depth, int alpha, int beta, bool maximizing)
    {
        if (depth == 0)
            return Evaluate(board, bot);

        var moves = GameEngine.LegalMoves(board, toMove, ruleSet);
        if (moves.Count == 0)
            return Evaluate(board, bot); // no legal reply found — score the position as-is rather than special-casing a stalemate Khet's rules don't otherwise produce

        if (maximizing)
        {
            var best = int.MinValue;
            foreach (var move in moves)
            {
                var afterLaser = PlayOut(board, move, toMove);
                var status = GameEngine.CheckWin(afterLaser);
                var score = status != GameStatus.InProgress
                    ? (status == WinFor(bot) ? WinScore : LossScore)
                    : Minimax(afterLaser, Other(toMove), bot, ruleSet, depth - 1, alpha, beta, maximizing: false);

                best = Math.Max(best, score);
                alpha = Math.Max(alpha, best);
                if (beta <= alpha)
                    break;
            }
            return best;
        }
        else
        {
            var best = int.MaxValue;
            foreach (var move in moves)
            {
                var afterLaser = PlayOut(board, move, toMove);
                var status = GameEngine.CheckWin(afterLaser);
                var score = status != GameStatus.InProgress
                    ? (status == WinFor(bot) ? WinScore : LossScore)
                    : Minimax(afterLaser, Other(toMove), bot, ruleSet, depth - 1, alpha, beta, maximizing: true);

                best = Math.Min(best, score);
                beta = Math.Min(beta, best);
                if (beta <= alpha)
                    break;
            }
            return best;
        }
    }

    /// <summary>Applies <paramref name="move"/> and fires <paramref name="mover"/>'s own laser — the same two-step every real move takes.</summary>
    private static Board PlayOut(Board board, EngineMove move, Player mover)
    {
        var afterMove = GameEngine.ApplyMove(board, move);
        var (afterLaser, _) = GameEngine.FireLaser(afterMove, mover);
        return afterLaser;
    }

    /// <summary>
    /// Static eval from <paramref name="bot"/>'s perspective: material (obelisk stacks worth their
    /// health, the pharaoh worth far more than any piece that can actually be captured mid-game
    /// since losing it ends the game) minus a penalty for whatever the opponent's laser would hit if
    /// they fired from this exact position without moving first — a cheap, static proxy for "did
    /// this move leave something hanging," not a real extra search ply (that's what the recursive
    /// minimax call is for at Medium/Hard).
    /// </summary>
    private static int Evaluate(Board board, Player bot)
    {
        var opponent = Other(bot);
        var status = GameEngine.CheckWin(board);
        if (status == WinFor(bot))
            return WinScore;
        if (status == WinFor(opponent))
            return LossScore;

        var score = Material(board, bot) - Material(board, opponent);

        var (_, opponentThreat) = GameEngine.FireLaser(board, opponent);
        score -= ThreatPenalty(board, opponentThreat, bot);

        return score;
    }

    private static int ThreatPenalty(Board board, LaserOutcome threat, Player owner)
    {
        var penalty = 0;

        foreach (var coord in threat.Eliminated)
        {
            var piece = board.PieceAt(coord);
            if (piece is null || piece.Owner != owner)
                continue;
            penalty += piece.Kind == Piece.Pharaoh ? PharaohThreatPenalty : PieceValue(piece.Kind, piece.Health);
        }

        foreach (var damage in threat.Damaged)
        {
            var piece = board.PieceAt(damage.Cell);
            if (piece is null || piece.Owner != owner)
                continue;
            penalty += 1; // one health point at risk, not the whole piece
        }

        return penalty;
    }

    private static int Material(Board board, Player player) =>
        board.Pieces.Values.Where(p => p.Owner == player).Sum(p => PieceValue(p.Kind, p.Health));

    private static int PieceValue(Piece kind, int? health) => kind switch
    {
        Piece.Pharaoh => 1000,
        Piece.Obelisk => health ?? 1,
        Piece.Djed => 4,
        Piece.Pyramid => 3,
        Piece.Anubis => 3,
        Piece.Sphinx => 0, // indestructible — never appears in Eliminated/Damaged, contributes no swing
        _ => 1,
    };

    private static GameStatus WinFor(Player player) => player == Player.P1 ? GameStatus.P1Win : GameStatus.P2Win;
}
