using Heliograph.Engine.Enums;

namespace Heliograph.Engine;

/// <summary>
/// The known named starting setups — <see cref="Dawn"/>, <see cref="Zenith"/> and <see cref="Dusk"/> —
/// each playable under either ruleset. <see cref="For(string)"/> / <see cref="For(string, RuleSet)"/>
/// resolve a name coming off the wire or DB.
/// </summary>
/// <remarks>
/// <para>
/// Owner decision (IP-02 reversal): these three names carry the original published board content —
/// Dawn = Classic, Zenith = Imhotep, Dusk = Dynasty (the retired layout ids), each ported
/// piece-for-piece and square-for-square from the published setups, under the new piece names. The game is fully rebranded elsewhere
/// (name, pieces, art, domain); the owner chose to keep the original board designs rather than the
/// three invented replacements this project shipped for a time, accepting the residual trade-dress
/// risk IP-02 itself documents. See that item's file for the decision record.
/// </para>
/// <para>
/// Each setup is authored as a full board (both players' halves written out), not derived by
/// rotation: every one of these three boards is symmetric in *position* under a 180° turn, but not
/// always in *facing* — a handful of pieces on each board face each other rather than being pure
/// rotations of one another, a genuine property of the original designs. A
/// P1-only-plus-180°-rotation shortcut can't express that, so none is used here.
/// </para>
/// <para>
/// The rotating-emitter arrangement (<see cref="RuleSets.TurningSun"/>) for each setup is also a
/// full hand-authored board (<see cref="DawnTurning"/>/<see cref="ZenithTurning"/>/
/// <see cref="DuskTurning"/>), not a generic derivation: each bastion's Sentinel facing was chosen
/// per layout so a same-turn Heliostat rotate never destroys the mover's own piece, matching the
/// original rotating-emitter boards' own hand-picked facings.
/// </para>
/// <para>
/// The invariants every setup must hold — legal squares only, a quiet opening beam, no immediately
/// winning first move, and position symmetry (with the documented facing exceptions) — are pinned
/// in <c>BoardLayoutTests</c>, under both rulesets.
/// </para>
/// </remarks>
public static class BoardLayouts
{
    /// <summary>The setup a game gets when the request names none.</summary>
    public const string DefaultName = "Dawn";

    /// <summary>
    /// Dawn — the original Classic opening (24 pieces, 12 per player). The historical default.
    /// </summary>
    public static readonly BoardLayout Dawn = new("Dawn", GameEngine.Rows, GameEngine.Cols,
    [
        Mirror(3, 0, Orientation.NE, Player.P2),
        Mirror(4, 0, Orientation.SE, Player.P2),
        Mirror(1, 2, Orientation.SW, Player.P2),
        Mirror(3, 2, Orientation.SW, Player.P1),
        Mirror(4, 2, Orientation.NW, Player.P1),
        Mirror(7, 2, Orientation.NW, Player.P1),
        Mirror(2, 3, Orientation.NW, Player.P1),
        Bastion(7, 3, Player.P1),
        Bastion(0, 4, Player.P2),
        Swivel(3, 4, Orientation.NE, Player.P2),
        Swivel(4, 4, Orientation.NW, Player.P1),
        Keep(7, 4, Player.P1),
        Keep(0, 5, Player.P2),
        Swivel(3, 5, Orientation.NW, Player.P2),
        Swivel(4, 5, Orientation.NE, Player.P1),
        Bastion(7, 5, Player.P1),
        Bastion(0, 6, Player.P2),
        Mirror(5, 6, Orientation.SE, Player.P2),
        Mirror(0, 7, Orientation.SE, Player.P2),
        Mirror(3, 7, Orientation.SE, Player.P2),
        Mirror(4, 7, Orientation.NE, Player.P2),
        Mirror(6, 7, Orientation.NE, Player.P1),
        Mirror(3, 9, Orientation.NW, Player.P1),
        Mirror(4, 9, Orientation.SW, Player.P1),
    ]);

    /// <summary>
    /// Dawn's Turning Sun arrangement — the original rotating-emitter Classic board: Dawn's non-bastion
    /// pieces unchanged, its four bastions replaced one for one by a Sentinel, and a Heliostat on
    /// each corner aimed to match Dawn's own fixed-emitter opening beam.
    /// </summary>
    /// <remarks>
    /// Each Sentinel faces its own Heliostat's *alternate* firing lane (row 7 for P1, row 0 for P2),
    /// not into the board: a Heliostat rotate is a single legal move, and the beam it re-aims down
    /// the back row would otherwise hit these Sentinels from the side/back and destroy the mover's
    /// own piece on their own turn. Facing the lane means that same rotate hits their front instead,
    /// which survives — see <c>Own_heliostat_rotate_does_not_destroy_any_piece_in_its_new_lane</c>.
    /// </remarks>
    public static readonly BoardLayout DawnTurning = new("Dawn", GameEngine.Rows, GameEngine.Cols,
    [
        .. Dawn.Pieces.Where(p => p.Kind != Piece.Bastion),
        Sentinel(7, 3, Orientation.SE, Player.P1),
        Sentinel(7, 5, Orientation.SE, Player.P1),
        Sentinel(0, 4, Orientation.NW, Player.P2),
        Sentinel(0, 6, Orientation.NW, Player.P2),
        Heliostat(7, 9, Orientation.NE, Player.P1),
        Heliostat(0, 0, Orientation.SW, Player.P2),
    ]);

    /// <summary>
    /// Zenith — the original Imhotep opening (24 pieces, 12 per player, standard counts).
    /// </summary>
    public static readonly BoardLayout Zenith = new("Zenith", GameEngine.Rows, GameEngine.Cols,
    [
        Bastion(0, 4, Player.P2),
        Keep(0, 5, Player.P2),
        Bastion(0, 6, Player.P2),
        Swivel(0, 7, Orientation.NE, Player.P2),
        Mirror(2, 3, Orientation.NW, Player.P1),
        Mirror(2, 6, Orientation.NE, Player.P2),
        Mirror(3, 0, Orientation.NE, Player.P2),
        // NW, not the source literal's NE: P2's opening shot deflects off (3,0) and travels Right
        // into this square; NE is a blank face for that entry (would destroy P1's own piece before
        // P1's first move). NW deflects it instead — see Opening_laser_destroys_nothing_for_either_player.
        Mirror(3, 1, Orientation.NW, Player.P1),
        Mirror(3, 4, Orientation.NW, Player.P1),
        Swivel(3, 5, Orientation.NW, Player.P2),
        Mirror(3, 8, Orientation.SE, Player.P2),
        Mirror(3, 9, Orientation.NW, Player.P1),
        Mirror(4, 0, Orientation.SE, Player.P2),
        Mirror(4, 1, Orientation.NE, Player.P1),
        Swivel(4, 4, Orientation.NW, Player.P1),
        Mirror(4, 5, Orientation.NW, Player.P2),
        Mirror(4, 8, Orientation.NE, Player.P2),
        // SW, not the source literal's NW: NW is a blank face to a beam entering from below, which
        // is exactly P1's own opening shot straight up column 9 — see
        // Opening_laser_destroys_nothing_for_either_player. SW deflects it instead, matching the
        // orientation Dawn already uses at this same square.
        Mirror(4, 9, Orientation.SW, Player.P1),
        Mirror(5, 3, Orientation.NE, Player.P1),
        Mirror(5, 6, Orientation.SE, Player.P2),
        Swivel(7, 2, Orientation.NW, Player.P1),
        Bastion(7, 3, Player.P1),
        Keep(7, 4, Player.P1),
        Bastion(7, 5, Player.P1),
    ]);

    /// <summary>Zenith's Turning Sun arrangement — the original rotating-emitter Imhotep board.</summary>
    /// <remarks>
    /// Same bastion squares as Dawn's, so the same front-facing orientations that keep Dawn's
    /// Sentinels alive under its own Heliostat's rotated lane apply here unchanged: Imhotep's own
    /// opening beam and its own rotated-lane beam never reach these squares at all, so the
    /// orientations only need to survive if a later engine change makes them reachable, and are kept
    /// faithful to the Dawn precedent rather than picked arbitrarily.
    /// </remarks>
    public static readonly BoardLayout ZenithTurning = new("Zenith", GameEngine.Rows, GameEngine.Cols,
    [
        .. Zenith.Pieces.Where(p => p.Kind != Piece.Bastion),
        Sentinel(7, 3, Orientation.SE, Player.P1),
        Sentinel(7, 5, Orientation.SE, Player.P1),
        Sentinel(0, 4, Orientation.NW, Player.P2),
        Sentinel(0, 6, Orientation.NW, Player.P2),
        Heliostat(7, 9, Orientation.NE, Player.P1),
        Heliostat(0, 0, Orientation.SW, Player.P2),
    ]);

    /// <summary>
    /// Dusk — the original Dynasty opening (24 pieces, 12 per player, standard counts).
    /// </summary>
    public static readonly BoardLayout Dusk = new("Dusk", GameEngine.Rows, GameEngine.Cols,
    [
        Mirror(0, 4, Orientation.NE, Player.P2),
        Bastion(0, 5, Player.P2),
        Mirror(0, 6, Orientation.SW, Player.P2),
        Keep(1, 5, Player.P2),
        Mirror(2, 0, Orientation.NE, Player.P2),
        // SW, not the source literal's NE: P2's own opening shot deflects off (2,0) and travels
        // Right into this square; NE is a blank face for that entry (self-destruction on P2's first
        // move). SW deflects it instead — see Opening_laser_destroys_nothing_for_either_player.
        Mirror(2, 4, Orientation.SW, Player.P2),
        Bastion(2, 5, Player.P2),
        Swivel(2, 6, Orientation.NE, Player.P2),
        Mirror(3, 0, Orientation.SE, Player.P2),
        Swivel(3, 2, Orientation.NW, Player.P2),
        Mirror(3, 4, Orientation.NW, Player.P1),
        Mirror(3, 6, Orientation.SE, Player.P1),
        Mirror(4, 3, Orientation.NW, Player.P2),
        Mirror(4, 5, Orientation.SE, Player.P2),
        Swivel(4, 7, Orientation.NE, Player.P1),
        Mirror(4, 9, Orientation.NW, Player.P1),
        Swivel(5, 3, Orientation.NW, Player.P1),
        Bastion(5, 4, Player.P1),
        Mirror(5, 5, Orientation.NE, Player.P1),
        Mirror(5, 9, Orientation.SW, Player.P1),
        Keep(6, 4, Player.P1),
        Mirror(7, 3, Orientation.NW, Player.P1),
        Bastion(7, 4, Player.P1),
        Mirror(7, 5, Orientation.NE, Player.P1),
    ]);

    /// <summary>Dusk's Turning Sun arrangement — the original rotating-emitter Dynasty board.</summary>
    /// <remarks>
    /// Two of Dusk's own (non-bastion) mirrors are re-oriented for Turning Sun specifically — forced
    /// by Heliostat-rotate safety at (5,5) and (0,4), the same way the bastion-derived Sentinels are
    /// chosen below — and the Sentinels sit on different squares than Dawn's/Zenith's:
    /// (5,4)/(7,4) for P1, (0,5)/(2,5) for P2, matching Dusk's own bastion squares.
    /// </remarks>
    public static readonly BoardLayout DuskTurning = new("Dusk", GameEngine.Rows, GameEngine.Cols,
    [
        .. Dusk.Pieces.Where(p => p.Kind != Piece.Bastion).Select(p => p.At switch
        {
            { Row: 5, Col: 5 } => p with { Orientation = Orientation.SE },
            { Row: 0, Col: 4 } => p with { Orientation = Orientation.NW },
            _ => p,
        }),
        Sentinel(5, 4, Orientation.NE, Player.P1),
        Sentinel(7, 4, Orientation.NE, Player.P1),
        Sentinel(0, 5, Orientation.SW, Player.P2),
        Sentinel(2, 5, Orientation.SW, Player.P2),
        Heliostat(7, 9, Orientation.NE, Player.P1),
        Heliostat(0, 0, Orientation.SW, Player.P2),
    ]);

    private static readonly IReadOnlyDictionary<string, BoardLayout> ByName =
        new[] { Dawn, Zenith, Dusk }.ToDictionary(l => l.Name, StringComparer.OrdinalIgnoreCase);

    private static readonly IReadOnlyDictionary<string, BoardLayout> RotatingByName =
        new[] { DawnTurning, ZenithTurning, DuskTurning }.ToDictionary(l => l.Name, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyCollection<string> Names => (IReadOnlyCollection<string>)ByName.Keys;

    public static bool IsKnown(string name) => ByName.ContainsKey(name);

    /// <summary>
    /// Resolves a setup's fixed-emitter arrangement by name (case-insensitive) — also the way to
    /// canonicalise a name's casing. Throws <see cref="UnknownBoardLayoutException"/> if unknown.
    /// </summary>
    public static BoardLayout For(string name) =>
        ByName.TryGetValue(name, out var layout)
            ? layout
            : throw new UnknownBoardLayoutException(name);

    /// <summary>
    /// Resolves the arrangement a game under <paramref name="rules"/> actually starts from: the
    /// hand-authored Heliostat/Sentinel board when the ruleset has a rotating emitter, the authored
    /// fixed-emitter one otherwise. Throws <see cref="UnknownBoardLayoutException"/> if the name is
    /// unknown.
    /// </summary>
    public static BoardLayout For(string name, RuleSet rules) =>
        (rules.RotatingHeliostat ? RotatingByName : ByName).TryGetValue(name, out var layout)
            ? layout
            : throw new UnknownBoardLayoutException(name);

    /// <summary>The 180° rotation of a square: P1's (r, c) is P2's (Rows-1-r, Cols-1-c).</summary>
    internal static Coord Rotate180(Coord c) => new(GameEngine.Rows - 1 - c.Row, GameEngine.Cols - 1 - c.Col);

    /// <summary>The 180° rotation of a facing: NW↔SE, NE↔SW.</summary>
    internal static Orientation Rotate180(Orientation o) => (Orientation)(((int)o + 2) % 4);

    private static PlacedPiece Mirror(int row, int col, Orientation o, Player p) => new(new Coord(row, col), Piece.Mirror, p, o, null);
    private static PlacedPiece Swivel(int row, int col, Orientation o, Player p) => new(new Coord(row, col), Piece.Swivel, p, o, null);
    private static PlacedPiece Bastion(int row, int col, Player p) => new(new Coord(row, col), Piece.Bastion, p, null, 2);
    private static PlacedPiece Keep(int row, int col, Player p) => new(new Coord(row, col), Piece.Keep, p, null, null);
    private static PlacedPiece Heliostat(int row, int col, Orientation o, Player p) => new(new Coord(row, col), Piece.Heliostat, p, o, null);
    private static PlacedPiece Sentinel(int row, int col, Orientation o, Player p) => new(new Coord(row, col), Piece.Sentinel, p, o, null);
}

/// <summary>A game was asked for with a layout name that is not in the registry. The API surfaces it as 400.</summary>
public sealed class UnknownBoardLayoutException(string name)
    : Exception($"unknown layout '{name}'")
{
    public string Name { get; } = name;
}
