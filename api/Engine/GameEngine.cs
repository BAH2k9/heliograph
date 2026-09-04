using Khet.Api.Domain;
using Khet.Api.Domain.Enums;

namespace Khet.Api.Engine;

/// <summary>
/// The Khet rules engine. Pure and deterministic: no EF, no async, no DI, no clock, no RNG.
/// Every method takes a <see cref="Board"/> and returns a new one — nothing mutates in place.
///
/// Coordinates: (0,0) is the top-left square, row increases downward, column to the right.
/// Board is 8 rows x 10 columns (Classic Khet). P1 (bottom) fires up column 9 from (7,9);
/// P2 (top) fires down column 0 from (0,0).
/// </summary>
public static class GameEngine
{
    public const int Rows = 8;
    public const int Cols = 10;

    private static readonly Coord P1Emitter = new(7, 9);
    private static readonly Coord P2Emitter = new(0, 0);

    /// <summary>
    /// The standard Classic opening position (24 pieces, 12 per player). Kept as a no-arg
    /// convenience; the definition now lives in <see cref="BoardLayouts.Classic"/> so other
    /// starting positions can be added without touching the engine.
    /// </summary>
    public static Board CreateStartingBoard() => BoardLayouts.Classic.Build();

    /// <summary>The fixed laser emitter square and initial beam direction for a player (original Khet).</summary>
    public static (Coord Emitter, Direction Dir) EmitterFor(Player p) =>
        p == Player.P1 ? (P1Emitter, Direction.Up) : (P2Emitter, Direction.Down);

    /// <summary>
    /// Where <paramref name="shooter"/>'s beam originates on this board. If the board carries that
    /// player's <see cref="Piece.Sphinx"/> (Khet 2.0), the beam starts from the Sphinx's square
    /// aimed by its orientation; otherwise from the fixed corner emitter (original Khet). Driven
    /// by the pieces on the board, not by a ruleset flag — a Sphinx-less board is always "Classic".
    /// </summary>
    public static (Coord Start, Direction Dir) LaserSourceFor(Board board, Player shooter)
    {
        foreach (var (coord, piece) in board.Pieces)
            if (piece.Kind == Piece.Sphinx && piece.Owner == shooter)
                return (coord, SphinxBeamDirection(piece.Orientation!.Value));

        return EmitterFor(shooter);
    }

    /// <summary>The cardinal direction a Sphinx facing <paramref name="o"/> fires its beam.</summary>
    internal static Direction SphinxBeamDirection(Orientation o) => o switch
    {
        Orientation.NW => Direction.Left,
        Orientation.NE => Direction.Up,
        Orientation.SE => Direction.Right,
        Orientation.SW => Direction.Down,
        _ => throw new ArgumentOutOfRangeException(nameof(o), o, "not a Sphinx orientation"),
    };

    /// <summary>
    /// The two orientations a Sphinx on <paramref name="square"/> may face — both aim the beam
    /// onto the board. A rotate toggles between them regardless of CW/CCW (you flip the piece).
    /// Only the two corner squares carry a Sphinx in play.
    /// </summary>
    internal static (Orientation A, Orientation B) SphinxFacings(Coord square)
    {
        if (square == P1Emitter) return (Orientation.NE, Orientation.NW); // (7,9): up column 9 / left along row 7
        if (square == P2Emitter) return (Orientation.SW, Orientation.SE); // (0,0): down column 0 / right along row 0
        throw new InvalidOperationException($"no Sphinx facing rule for square ({square.Row},{square.Col})");
    }

    /// <summary>
    /// Which player a square is reserved for, or null if it is neutral. A player may not move
    /// a piece onto a square reserved for the other player. Ported from KhetV3 SquareFactory.
    /// P1: all of column 9, plus (0,1) and (7,1). P2: all of column 0, plus (0,8) and (7,8).
    /// </summary>
    public static Player? SquareOwner(Coord c)
    {
        if (c.Col == Cols - 1 || c == new Coord(0, 1) || c == new Coord(7, 1))
            return Player.P1;
        if (c.Col == 0 || c == new Coord(0, 8) || c == new Coord(7, 8))
            return Player.P2;
        return null;
    }

    public static MoveValidation ValidateMove(Board board, EngineMove move, Player toMove, RuleSet? rules = null)
    {
        if (!board.InBounds(move.From))
            return MoveValidation.Fail("from is off the board");

        var piece = board.PieceAt(move.From);
        if (piece is null)
            return MoveValidation.Fail("no piece at from");

        if (piece.Owner != toMove)
            return MoveValidation.Fail("that piece belongs to the other player");

        return move.Kind switch
        {
            MoveKind.Move => ValidateShift(board, move, piece, toMove),
            MoveKind.Rotate => ValidateRotate(move, piece),
            MoveKind.Stack => ValidateStack(board, move, piece, toMove, rules ?? RuleSets.Classic),
            MoveKind.Unstack => ValidateUnstack(board, move, piece, toMove, rules ?? RuleSets.Classic),
            _ => MoveValidation.Fail("unknown move kind"),
        };
    }

    private static MoveValidation ValidateShift(Board board, EngineMove move, PieceOnBoard piece, Player toMove)
    {
        if (piece.Kind == Piece.Sphinx)
            return MoveValidation.Fail("the sphinx cannot move");

        if (move.To is not { } to)
            return MoveValidation.Fail("a move must have a target square");

        if (!board.InBounds(to))
            return MoveValidation.Fail("destination is off the board");

        var dRow = Math.Abs(to.Row - move.From.Row);
        var dCol = Math.Abs(to.Col - move.From.Col);
        if ((dRow == 0 && dCol == 0) || dRow > 1 || dCol > 1)
            return MoveValidation.Fail("move is not to an adjacent square");

        var owner = SquareOwner(to);
        if (owner is not null && owner != toMove)
            return MoveValidation.Fail("cannot move onto opponent's restricted square");

        if (to == P1Emitter || to == P2Emitter)
            return MoveValidation.Fail("cannot move onto the laser emitter");

        var occupant = board.PieceAt(to);
        if (occupant is null)
            return MoveValidation.Ok;

        var isDjedSwap = piece.Kind == Piece.Djed
            && occupant.Kind is Piece.Pyramid or Piece.Obelisk;
        return isDjedSwap
            ? MoveValidation.Ok
            : MoveValidation.Fail("destination is occupied");
    }

    /// <summary>
    /// Stacking (Classic only): move an owned single obelisk onto an adjacent owned single obelisk,
    /// merging them into a two-high stack. The reverse of <see cref="ValidateUnstack"/>.
    /// </summary>
    private static MoveValidation ValidateStack(Board board, EngineMove move, PieceOnBoard piece, Player toMove, RuleSet rules)
    {
        if (!rules.StackableObelisks)
            return MoveValidation.Fail("stacking is not enabled for this ruleset");

        if (move.To is not { } to)
            return MoveValidation.Fail("a stack must have a target square");

        if (!board.InBounds(to))
            return MoveValidation.Fail("destination is off the board");

        if (!IsAdjacent(move.From, to))
            return MoveValidation.Fail("stack target is not an adjacent square");

        var owner = SquareOwner(to);
        if (owner is not null && owner != toMove)
            return MoveValidation.Fail("cannot stack onto opponent's restricted square");

        if (piece.Kind != Piece.Obelisk || (piece.Health ?? 1) != 1)
            return MoveValidation.Fail("only a single obelisk can be stacked");

        var occupant = board.PieceAt(to);
        if (occupant is null || occupant.Kind != Piece.Obelisk || occupant.Owner != toMove || (occupant.Health ?? 1) != 1)
            return MoveValidation.Fail("a stack target must be your own single obelisk");

        return MoveValidation.Ok;
    }

    /// <summary>
    /// Unstacking (Classic only): split a two-high obelisk, dropping one onto an adjacent empty,
    /// legal square. The reverse of <see cref="ValidateStack"/>.
    /// </summary>
    private static MoveValidation ValidateUnstack(Board board, EngineMove move, PieceOnBoard piece, Player toMove, RuleSet rules)
    {
        if (!rules.StackableObelisks)
            return MoveValidation.Fail("stacking is not enabled for this ruleset");

        if (move.To is not { } to)
            return MoveValidation.Fail("an unstack must have a target square");

        if (!board.InBounds(to))
            return MoveValidation.Fail("destination is off the board");

        if (!IsAdjacent(move.From, to))
            return MoveValidation.Fail("unstack target is not an adjacent square");

        var owner = SquareOwner(to);
        if (owner is not null && owner != toMove)
            return MoveValidation.Fail("cannot unstack onto opponent's restricted square");

        if (to == P1Emitter || to == P2Emitter)
            return MoveValidation.Fail("cannot unstack onto the laser emitter");

        if (piece.Kind != Piece.Obelisk || (piece.Health ?? 1) != 2)
            return MoveValidation.Fail("only a two-high obelisk can be unstacked");

        if (board.PieceAt(to) is not null)
            return MoveValidation.Fail("destination is occupied");

        return MoveValidation.Ok;
    }

    private static bool IsAdjacent(Coord a, Coord b)
    {
        var dRow = Math.Abs(a.Row - b.Row);
        var dCol = Math.Abs(a.Col - b.Col);
        return dRow <= 1 && dCol <= 1 && (dRow != 0 || dCol != 0);
    }

    private static MoveValidation ValidateRotate(EngineMove move, PieceOnBoard piece)
    {
        if (move.Rotation is null)
            return MoveValidation.Fail("a rotation must have a direction");

        return piece.Kind switch
        {
            // A Sphinx rotate is the whole turn: it flips between its two board-facing orientations.
            Piece.Pyramid or Piece.Djed or Piece.Sphinx => MoveValidation.Ok,
            Piece.Obelisk => MoveValidation.Fail("cannot rotate an obelisk"),
            _ => MoveValidation.Fail("cannot rotate a pharaoh"),
        };
    }

    /// <summary>Applies a move. Precondition: <see cref="ValidateMove"/> returned a legal result for it.</summary>
    public static Board ApplyMove(Board board, EngineMove move)
    {
        var piece = board.PieceAt(move.From)
            ?? throw new InvalidOperationException("ApplyMove called with no piece at 'from' — validate first.");

        if (move.Kind == MoveKind.Rotate)
        {
            var (a, b) = piece.Kind == Piece.Sphinx ? SphinxFacings(move.From) : default;
            var newOrientation = piece.Kind == Piece.Sphinx
                ? piece.Orientation!.Value == a ? b : a          // toggle, ignoring CW/CCW
                : Rotate(piece.Orientation!.Value, move.Rotation!.Value);
            return board.With(move.From, piece with { Orientation = newOrientation });
        }

        var to = move.To!.Value;

        if (move.Kind == MoveKind.Stack)
        {
            var target = board.PieceAt(to)
                ?? throw new InvalidOperationException("ApplyMove(Stack) called with no obelisk at 'to' — validate first.");
            return board.Without(move.From).With(to, target with { Health = 2 });
        }

        if (move.Kind == MoveKind.Unstack)
            return board
                .With(move.From, piece with { Health = 1 })
                .With(to, new PieceOnBoard(Piece.Obelisk, piece.Owner, null, 1));

        return board.PieceAt(to) is null
            ? board.Without(move.From).With(to, piece)
            : board.Swap(move.From, to);
    }

    /// <summary>
    /// Fires <paramref name="shooter"/>'s laser from its emitter, walks the beam through the
    /// board applying reflections, and returns the resulting board plus an ordered trace.
    /// </summary>
    public static (Board Board, LaserOutcome Outcome) FireLaser(Board board, Player shooter)
    {
        var (start, dir) = LaserSourceFor(board, shooter);
        return WalkLaser(board, start, dir);
    }

    /// <summary>
    /// Walks a beam from an arbitrary square and heading. The public <see cref="FireLaser"/>
    /// always starts from a fixed corner emitter; this seam exists for tests that need to
    /// drive the beam into a constructed configuration (e.g. a reflection cycle).
    /// </summary>
    internal static (Board Board, LaserOutcome Outcome) WalkLaser(Board board, Coord start, Direction dir)
    {
        var pos = start;
        var working = board;
        var emitterDir = dir; // dir is reassigned as the beam reflects; capture the initial heading.

        var segments = new List<LaserSegment>();
        var eliminated = new List<Coord>();
        var damaged = new List<LaserDamage>();
        var visited = new HashSet<(Coord, Direction)>();
        var enterEdge = EdgeFor(Opposite(dir));

        while (working.InBounds(pos))
        {
            // Two facing Djeds would bounce a beam forever; stop if we re-enter a square heading the same way.
            if (!visited.Add((pos, dir)))
                return (working, new LaserOutcome(segments, [], [], LaserTermination.ExitedBoard, null, start, emitterDir));

            var piece = working.PieceAt(pos);

            // The shooter's own Sphinx sits on its emitter square: the beam originates there and
            // passes straight out. Only on the first step — a beam that loops back to the Sphinx
            // later (segments already recorded) hits it and stops via the Stop switch below.
            if (pos == start && segments.Count == 0 && piece?.Kind == Piece.Sphinx)
                piece = null;

            Direction newDir;
            if (piece is null)
            {
                newDir = dir;
            }
            else if (piece.Kind is Piece.Pyramid or Piece.Djed)
            {
                // KhetV3 convention: the table is keyed by the side the beam ENTERS through,
                // which is Opposite(travel direction). Its value is the new travel direction, used as-is.
                var table = piece.Kind == Piece.Djed ? LaserReflection.Djed : LaserReflection.Pyramid;
                newDir = table[(Opposite(dir), piece.Orientation!.Value)];
            }
            else
            {
                newDir = Direction.Stop; // Obelisk and Pharaoh always absorb.
            }

            if (newDir == Direction.Stop)
            {
                segments.Add(new LaserSegment(pos.Row, pos.Col, enterEdge, null));

                // An empty square never yields Stop, so piece is non-null here.
                LaserTermination termination;
                switch (piece!.Kind)
                {
                    case Piece.Pharaoh:
                        working = working.Without(pos);
                        eliminated.Add(pos);
                        termination = LaserTermination.HitPharaoh;
                        break;

                    case Piece.Sphinx:
                        // Indestructible emitter housing — the beam just stops, board unchanged.
                        termination = LaserTermination.Absorbed;
                        break;

                    case Piece.Obelisk:
                        var health = piece.Health ?? 1;
                        if (health > 1)
                        {
                            working = working.With(pos, piece with { Health = health - 1 });
                            damaged.Add(new LaserDamage(pos, health - 1));
                        }
                        else
                        {
                            working = working.Without(pos);
                            eliminated.Add(pos);
                        }
                        termination = LaserTermination.Absorbed;
                        break;

                    default: // Pyramid struck on a blank (non-mirrored) face.
                        working = working.Without(pos);
                        eliminated.Add(pos);
                        termination = LaserTermination.Absorbed;
                        break;
                }

                return (working, new LaserOutcome(segments, eliminated, damaged, termination, pos, start, emitterDir));
            }

            segments.Add(new LaserSegment(pos.Row, pos.Col, enterEdge, EdgeFor(newDir)));
            dir = newDir;
            enterEdge = EdgeFor(Opposite(dir));
            pos = Step(pos, dir);
        }

        return (working, new LaserOutcome(segments, [], [], LaserTermination.ExitedBoard, null, start, emitterDir));
    }

    /// <summary>A player with no pharaoh on the board has lost.</summary>
    public static GameStatus CheckWin(Board board)
    {
        var p1HasPharaoh = false;
        var p2HasPharaoh = false;
        foreach (var piece in board.Pieces.Values)
        {
            if (piece.Kind != Piece.Pharaoh)
                continue;
            if (piece.Owner == Player.P1)
                p1HasPharaoh = true;
            else
                p2HasPharaoh = true;
        }

        if (!p1HasPharaoh)
            return GameStatus.P2Win;
        if (!p2HasPharaoh)
            return GameStatus.P1Win;
        return GameStatus.InProgress;
    }

    internal static Direction Opposite(Direction d) => d switch
    {
        Direction.Up => Direction.Down,
        Direction.Down => Direction.Up,
        Direction.Left => Direction.Right,
        Direction.Right => Direction.Left,
        _ => throw new ArgumentOutOfRangeException(nameof(d), d, "Opposite is only defined for the four travel directions"),
    };

    internal static Orientation Rotate(Orientation o, RotationDir dir)
    {
        // Orientation is declared NW, NE, SE, SW — a clockwise cycle. CW = +1, CCW = -1 (mod 4).
        var step = dir == RotationDir.CW ? 1 : 3;
        return (Orientation)(((int)o + step) % 4);
    }

    private static Coord Step(Coord c, Direction d) => d switch
    {
        Direction.Up => c with { Row = c.Row - 1 },
        Direction.Down => c with { Row = c.Row + 1 },
        Direction.Left => c with { Col = c.Col - 1 },
        Direction.Right => c with { Col = c.Col + 1 },
        _ => throw new ArgumentOutOfRangeException(nameof(d), d, "Step is only defined for the four travel directions"),
    };

    private static LaserEdge EdgeFor(Direction d) => d switch
    {
        Direction.Up => LaserEdge.Top,
        Direction.Down => LaserEdge.Bottom,
        Direction.Left => LaserEdge.Left,
        Direction.Right => LaserEdge.Right,
        _ => throw new ArgumentOutOfRangeException(nameof(d), d, "EdgeFor is only defined for the four travel directions"),
    };
}
