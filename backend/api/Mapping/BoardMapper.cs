using Khet.Api.Domain;
using Khet.Contracts;
using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Api.Mapping;

/// <summary>Raised when a wire request cannot be turned into an engine move. The API surfaces it as 400.</summary>
public sealed class MoveRequestException(string reason) : Exception(reason);

/// <summary>
/// The one place the engine's types meet the wire/storage contract types. Engine types never
/// appear in controller or DbContext signatures; contract records never appear in the engine.
/// </summary>
public static class BoardMapper
{
    public static BoardState ToState(Board board)
    {
        var pieces = board.Pieces
            .OrderBy(kv => kv.Key.Row)
            .ThenBy(kv => kv.Key.Col)
            .Select(kv => new BoardPiece(
                kv.Key.Row,
                kv.Key.Col,
                kv.Value.Kind.ToString(),
                kv.Value.Owner.ToString(),
                kv.Value.Orientation?.ToString(),
                kv.Value.Health))
            .ToList();

        return new BoardState(board.Rows, board.Cols, pieces);
    }

    public static Board ToBoard(BoardState state)
    {
        var pieces = state.Pieces.ToDictionary(
            p => new Coord(p.Row, p.Col),
            p => new PieceOnBoard(
                ParseEnum<Piece>(p.Kind, "kind"),
                ParseEnum<Player>(p.Owner, "owner"),
                p.Orientation is null ? null : ParseEnum<Orientation>(p.Orientation, "orientation"),
                p.Health));

        return Board.Create(state.Rows, state.Cols, pieces);
    }

    public static EngineMove ToEngineMove(SubmitMoveRequest request)
    {
        if (request.From is null)
            throw new MoveRequestException("'from' is required");

        var from = new Coord(request.From.Row, request.From.Col);

        switch ((request.Type ?? string.Empty).Trim().ToLowerInvariant())
        {
            case "move":
                if (request.To is null)
                    throw new MoveRequestException("'to' is required for a move");
                return EngineMove.Shift(from, new Coord(request.To.Row, request.To.Col));

            case "rotate":
                if (request.Rotation is null)
                    throw new MoveRequestException("'rotation' is required for a rotate");
                return EngineMove.Turn(from, ParseEnum<RotationDir>(request.Rotation, "rotation"));

            case "stack":
                if (request.To is null)
                    throw new MoveRequestException("'to' is required for a stack");
                return EngineMove.Stack(from, new Coord(request.To.Row, request.To.Col));

            case "unstack":
                if (request.To is null)
                    throw new MoveRequestException("'to' is required for an unstack");
                return EngineMove.Unstack(from, new Coord(request.To.Row, request.To.Col));

            default:
                throw new MoveRequestException("'type' must be 'move', 'rotate', 'stack' or 'unstack'");
        }
    }

    /// <summary>
    /// Reconstructs the <see cref="EngineMove"/> a stored <see cref="Move"/> row represents — the
    /// inverse of persisting one in <c>GameService.SubmitMoveAsync</c>. Used to replay a game's
    /// history through the engine. Unlike <see cref="ToEngineMove(SubmitMoveRequest)"/>, the row's
    /// fields are already typed/validated, so this can't fail.
    /// </summary>
    public static EngineMove ToEngineMove(Move move)
    {
        var from = new Coord(move.FromRow, move.FromCol);
        var to = move.ToRow is int row && move.ToCol is int col ? new Coord(row, col) : (Coord?)null;

        return move.Type switch
        {
            MoveKind.Move => EngineMove.Shift(from, to!.Value),
            MoveKind.Rotate => EngineMove.Turn(from, move.RotationDir!.Value),
            MoveKind.Stack => EngineMove.Stack(from, to!.Value),
            MoveKind.Unstack => EngineMove.Unstack(from, to!.Value),
            _ => throw new InvalidOperationException($"unhandled move kind {move.Type}"),
        };
    }

    /// <param name="preLaserBoard">The board the laser fired into — used to describe eliminated pieces.</param>
    public static LaserResult ToLaserResult(LaserOutcome outcome, Player shooter, Board preLaserBoard)
    {
        // The emitter position + heading come from the outcome itself, so a movable laser
        // source (a Sphinx) needs no special case here.
        var emitter = outcome.Emitter;
        var direction = outcome.EmitterDirection;

        var segments = outcome.Segments
            .Select(s => new LaserResultSegment(s.Row, s.Col, s.Enter.ToString(), s.Exit?.ToString()))
            .ToList();

        var eliminated = outcome.Eliminated
            .Select(c =>
            {
                var piece = preLaserBoard.PieceAt(c);
                return new EliminatedPiece(
                    c.Row,
                    c.Col,
                    piece?.Kind.ToString() ?? "Unknown",
                    piece?.Owner.ToString() ?? "Unknown");
            })
            .ToList();

        var damaged = outcome.Damaged
            .Select(d => new DamagedPiece(d.Cell.Row, d.Cell.Col, d.HealthRemaining))
            .ToList();

        return new LaserResult(
            shooter.ToString(),
            new EmitterInfo(emitter.Row, emitter.Col, direction.ToString()),
            outcome.Termination.ToString(),
            segments,
            outcome.HitCell is { } hit ? new CoordDto(hit.Row, hit.Col) : null,
            eliminated,
            damaged);
    }

    private static TEnum ParseEnum<TEnum>(string value, string field) where TEnum : struct =>
        Enum.TryParse<TEnum>(value, ignoreCase: true, out var parsed)
            ? parsed
            : throw new MoveRequestException($"'{field}' has an unrecognised value '{value}'");
}
