using System.Linq;
using Khet.Engine.Enums;

namespace Khet.Engine;

/// <summary>The known named starting layouts. <see cref="For"/> resolves a name coming off the wire or DB.</summary>
public static class BoardLayouts
{
    /// <summary>
    /// The standard Classic opening position (24 pieces, 12 per player). The historical default —
    /// <see cref="GameEngine.CreateStartingBoard"/> delegates here.
    /// </summary>
    /// <remarks>
    /// The dimensions come from <see cref="GameEngine"/>'s <c>const int</c> Rows/Cols, which the
    /// compiler inlines — so there is no static-init ordering hazard with GameEngine referencing
    /// this field back. Do not change Rows/Cols to <c>static readonly</c> without revisiting this.
    /// </remarks>
    public static readonly BoardLayout Classic = new("Classic", GameEngine.Rows, GameEngine.Cols,
    [
        Pyr(3, 0, Orientation.NE, Player.P2),
        Pyr(4, 0, Orientation.SE, Player.P2),
        Pyr(1, 2, Orientation.SW, Player.P2),
        Pyr(3, 2, Orientation.SW, Player.P1),
        Pyr(4, 2, Orientation.NW, Player.P1),
        Pyr(7, 2, Orientation.NW, Player.P1),
        Pyr(2, 3, Orientation.NW, Player.P1),
        Obelisk(7, 3, Player.P1),
        Obelisk(0, 4, Player.P2),
        Djed(3, 4, Orientation.NE, Player.P2),
        Djed(4, 4, Orientation.NW, Player.P1),
        Pharaoh(7, 4, Player.P1),
        Pharaoh(0, 5, Player.P2),
        Djed(3, 5, Orientation.NW, Player.P2),
        Djed(4, 5, Orientation.NE, Player.P1),
        Obelisk(7, 5, Player.P1),
        Obelisk(0, 6, Player.P2),
        Pyr(5, 6, Orientation.SE, Player.P2),
        Pyr(0, 7, Orientation.SE, Player.P2),
        Pyr(3, 7, Orientation.SE, Player.P2),
        Pyr(4, 7, Orientation.NE, Player.P2),
        Pyr(6, 7, Orientation.NE, Player.P1),
        Pyr(3, 9, Orientation.NW, Player.P1),
        Pyr(4, 9, Orientation.SW, Player.P1),
    ]);

    /// <summary>
    /// The Classic arrangement for the <c>Khet2</c> ruleset, with its obelisk fidelity: the same
    /// pyramids/djeds/pharaohs, a <see cref="Piece.Sphinx"/> on each corner (aimed so the opening
    /// beam is identical to Classic — P1 up column 9, P2 down column 0), and the four stacked
    /// obelisks replaced one-for-one by a <see cref="Piece.Anubis"/>.
    /// 26 pieces: 24 non-Sphinx pieces + 2 Sphinx.
    /// </summary>
    /// <remarks>
    /// Each Anubis faces its own Sphinx's *alternate* firing lane (row 7 for P1, row 0 for P2),
    /// not into the board — that was the first choice and it was wrong: a Sphinx rotate is a
    /// single legal move, and the beam it re-aims down the back row would have hit these Anubis
    /// from the side/back and destroyed the mover's own piece on their own turn. Facing the lane
    /// means that same rotate hits their front instead, which survives. See
    /// Khet2Classic_own_sphinx_rotate_does_not_destroy_the_own_anubis_in_its_new_lane.
    /// A fully faithful Khet 2.0 opening (its own piece arrangement, not Classic's) is a
    /// possible follow-up for the alt-layouts work; this is a playable, board-fidelity-correct
    /// Khet2-ruleset board.
    /// </remarks>
    public static readonly BoardLayout Khet2Classic = new("Khet2Classic", GameEngine.Rows, GameEngine.Cols,
    [
        .. Classic.Pieces.Where(p => p.Kind != Piece.Obelisk),
        Anubis(7, 3, Orientation.SE, Player.P1), // front faces Right, into row 7 from the P1 Sphinx's rotated lane
        Anubis(7, 5, Orientation.SE, Player.P1),
        Anubis(0, 4, Orientation.NW, Player.P2), // front faces Left, into row 0 from the P2 Sphinx's rotated lane
        Anubis(0, 6, Orientation.NW, Player.P2),
        Sphinx(7, 9, Orientation.NE, Player.P1), // fires Up column 9
        Sphinx(0, 0, Orientation.SW, Player.P2), // fires Down column 0
    ]);

    /// <summary>
    /// An alternate Classic-ruleset opening (24 pieces, 12 per player, the standard 7 pyramid /
    /// 2 djed / 2 obelisk / 1 pharaoh counts). Fixed-emitter, stacked obelisks — same board
    /// fidelity as <see cref="Classic"/>, just a different starting arrangement.
    /// </summary>
    public static readonly BoardLayout Imhotep = new("Imhotep", GameEngine.Rows, GameEngine.Cols,
    [
        Obelisk(0, 4, Player.P2),
        Pharaoh(0, 5, Player.P2),
        Obelisk(0, 6, Player.P2),
        Djed(0, 7, Orientation.NE, Player.P2),
        Pyr(2, 3, Orientation.NW, Player.P1),
        Pyr(2, 6, Orientation.NE, Player.P2),
        Pyr(3, 0, Orientation.NE, Player.P2),
        // NW, not the source literal's NE: P2's opening shot deflects off (3,0) and travels
        // Right into this square; NE is a blank face for that entry (would destroy P1's own
        // piece before P1's first move). NW deflects it instead — see
        // Opening_laser_destroys_nothing_for_either_player.
        Pyr(3, 1, Orientation.NW, Player.P1),
        Pyr(3, 4, Orientation.NW, Player.P1),
        Djed(3, 5, Orientation.NW, Player.P2),
        Pyr(3, 8, Orientation.SE, Player.P2),
        Pyr(3, 9, Orientation.NW, Player.P1),
        Pyr(4, 0, Orientation.SE, Player.P2),
        Pyr(4, 1, Orientation.NE, Player.P1),
        Djed(4, 4, Orientation.NW, Player.P1),
        Pyr(4, 5, Orientation.NW, Player.P2),
        Pyr(4, 8, Orientation.NE, Player.P2),
        // SW, not the source literal's NW: NW is a blank face to a beam entering from below,
        // which is exactly P1's own opening shot straight up column 9 — see
        // Opening_laser_destroys_nothing_for_either_player. SW deflects it instead, matching the
        // orientation Classic already uses at this same square.
        Pyr(4, 9, Orientation.SW, Player.P1),
        Pyr(5, 3, Orientation.NE, Player.P1),
        Pyr(5, 6, Orientation.SE, Player.P2),
        Djed(7, 2, Orientation.NW, Player.P1),
        Obelisk(7, 3, Player.P1),
        Pharaoh(7, 4, Player.P1),
        Obelisk(7, 5, Player.P1),
    ]);

    /// <summary>
    /// An alternate Classic-ruleset opening (24 pieces, 12 per player, standard piece counts).
    /// Fixed-emitter, stacked obelisks — same board fidelity as <see cref="Classic"/>.
    /// </summary>
    public static readonly BoardLayout Dynasty = new("Dynasty", GameEngine.Rows, GameEngine.Cols,
    [
        Pyr(0, 4, Orientation.NE, Player.P2),
        Obelisk(0, 5, Player.P2),
        Pyr(0, 6, Orientation.SW, Player.P2),
        Pharaoh(1, 5, Player.P2),
        Pyr(2, 0, Orientation.NE, Player.P2),
        // SW, not the source literal's NE: P2's own opening shot deflects off (2,0) and travels
        // Right into this square; NE is a blank face for that entry (self-destruction on P2's
        // first move). SW deflects it instead — see Opening_laser_destroys_nothing_for_either_player.
        Pyr(2, 4, Orientation.SW, Player.P2),
        Obelisk(2, 5, Player.P2),
        Djed(2, 6, Orientation.NE, Player.P2),
        Pyr(3, 0, Orientation.SE, Player.P2),
        Djed(3, 2, Orientation.NW, Player.P2),
        Pyr(3, 4, Orientation.NW, Player.P1),
        Pyr(3, 6, Orientation.SE, Player.P1),
        Pyr(4, 3, Orientation.NW, Player.P2),
        Pyr(4, 5, Orientation.SE, Player.P2),
        Djed(4, 7, Orientation.NE, Player.P1),
        Pyr(4, 9, Orientation.NW, Player.P1),
        Djed(5, 3, Orientation.NW, Player.P1),
        Obelisk(5, 4, Player.P1),
        Pyr(5, 5, Orientation.NE, Player.P1),
        Pyr(5, 9, Orientation.SW, Player.P1),
        Pharaoh(6, 4, Player.P1),
        Pyr(7, 3, Orientation.NW, Player.P1),
        Obelisk(7, 4, Player.P1),
        Pyr(7, 5, Orientation.NE, Player.P1),
    ]);

    private static readonly IReadOnlyDictionary<string, BoardLayout> ByName =
        new[] { Classic, Khet2Classic, Imhotep, Dynasty }.ToDictionary(l => l.Name, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyCollection<string> Names => (IReadOnlyCollection<string>)ByName.Keys;

    public static bool IsKnown(string name) => ByName.ContainsKey(name);

    /// <summary>Resolves a layout by name (case-insensitive). Throws <see cref="UnknownBoardLayoutException"/> if unknown.</summary>
    public static BoardLayout For(string name) =>
        ByName.TryGetValue(name, out var layout)
            ? layout
            : throw new UnknownBoardLayoutException(name);

    private static PlacedPiece Pyr(int row, int col, Orientation o, Player p) =>
        new(new Coord(row, col), Piece.Pyramid, p, o, null);

    private static PlacedPiece Djed(int row, int col, Orientation o, Player p) =>
        new(new Coord(row, col), Piece.Djed, p, o, null);

    private static PlacedPiece Obelisk(int row, int col, Player p) =>
        new(new Coord(row, col), Piece.Obelisk, p, null, 2);

    private static PlacedPiece Pharaoh(int row, int col, Player p) =>
        new(new Coord(row, col), Piece.Pharaoh, p, null, null);

    private static PlacedPiece Sphinx(int row, int col, Orientation o, Player p) =>
        new(new Coord(row, col), Piece.Sphinx, p, o, null);

    private static PlacedPiece Anubis(int row, int col, Orientation o, Player p) =>
        new(new Coord(row, col), Piece.Anubis, p, o, null);
}

/// <summary>A game was asked for with a layout name that is not in the registry. The API surfaces it as 400.</summary>
public sealed class UnknownBoardLayoutException(string name)
    : Exception($"unknown layout '{name}'")
{
    public string Name { get; } = name;
}
