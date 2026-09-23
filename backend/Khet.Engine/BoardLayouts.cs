using Khet.Engine.Enums;

namespace Khet.Engine;

/// <summary>
/// The known named starting setups — <see cref="Dawn"/>, <see cref="Zenith"/> and <see cref="Dusk"/> —
/// each playable under either ruleset. <see cref="For(string)"/> / <see cref="For(string, RuleSet)"/>
/// resolve a name coming off the wire or DB.
/// </summary>
/// <remarks>
/// <para>
/// Each setup is authored once: as its fixed-emitter arrangement (<see cref="RuleSets.Classic"/>:
/// two-high obelisks, no Sphinx), and for P1 only. <see cref="Setup"/> adds P2's half as the 180°
/// rotation of P1's, so every setup is point-symmetric by construction — the same square rotated,
/// the same facing turned half a circle.
/// </para>
/// <para>
/// The rotating-emitter arrangement (<see cref="RuleSets.Khet2"/>) is derived from it by
/// <see cref="WithRotatingEmitters"/>, never hand-written: each obelisk becomes an Anubis one for one,
/// and a Sphinx goes on each player's corner. That is why a setup is one name across both rulesets
/// (the stored <c>Games.Layout</c> is just "Dawn"/"Zenith"/"Dusk"); the ruleset picks the arrangement.
/// </para>
/// <para>
/// These are original designs (IP-02). The invariants every setup must hold — point symmetry, legal
/// squares only, a quiet opening beam, no immediately winning first move — are pinned in
/// <c>BoardLayoutTests</c>, under both rulesets.
/// </para>
/// </remarks>
public static class BoardLayouts
{
    /// <summary>The setup a game gets when the request names none.</summary>
    public const string DefaultName = "Dawn";

    /// <summary>
    /// Dawn — open and beginner-friendly. Both opening beams run straight off the board, the two
    /// armies are loosely spread with clear lanes between them, and each pharaoh sits on its back
    /// row behind a pair of obelisks with a pyramid guarding its corner side. No first move by
    /// either player leaves the other a winning reply.
    /// <code>
    ///        c0   c1   c2   c3   c4   c5   c6   c7   c8   c9
    ///  r0     .    .  mnw    k    .    .    .    .  msw    .
    ///  r1     .  mne    .    b    b    .  msw    .    .    .
    ///  r2     .    .  ssw    .    .  sse    .    .    .    .
    ///  r3     .    .  mse    .    .  msw    .    .  mse    .
    ///  r4     .  MNW    .    .  MNE    .    .  MNW    .    .
    ///  r5     .    .    .    .  SNW    .    .  SNE    .    .
    ///  r6     .    .    .  MNE    .    B    B    .  MSW    .
    ///  r7     .  MNE    .    .    .    .    K  MSE    .    .
    /// </code>
    /// K = pharaoh, B = two-high obelisk, S = djed, M = pyramid, suffix = orientation.
    /// Uppercase = P1 (fires up column 9), lowercase = P2 (fires down column 0).
    /// </summary>
    public static readonly BoardLayout Dawn = Setup("Dawn",
    [
        Pharaoh(7, 6),
        Obelisk(6, 5),
        Obelisk(6, 6),
        Djed(5, 4, Orientation.NW),
        Djed(5, 7, Orientation.NE),
        Pyr(4, 1, Orientation.NW),
        Pyr(4, 4, Orientation.NE),
        Pyr(4, 7, Orientation.NW),
        Pyr(6, 3, Orientation.NE),
        Pyr(6, 8, Orientation.SW),
        Pyr(7, 1, Orientation.NE),
        Pyr(7, 7, Orientation.SE), // turns a rotated Sphinx's back-row beam off the board before it reaches the pharaoh
    ]);

    /// <summary>
    /// Zenith — the pharaoh in the centre, balanced. Each pharaoh stands mid-board in a cross of
    /// defenders (an obelisk ahead and behind, a djed either side), with matching pyramid wings on
    /// both flanks. Both opening beams run straight off the board.
    /// <code>
    ///        c0   c1   c2   c3   c4   c5   c6   c7   c8   c9
    ///  r0     .    .  mnw    .    .    .    .    .  msw    .
    ///  r1     .  msw    .    .    b    .  mse    .    .    .
    ///  r2     .    .    .  sse    k  ssw    .    .  MNW    .
    ///  r3     .    .  msw    .    b    .  mse    .    .    .
    ///  r4     .    .    .  MNW    .    B    .  MNE    .    .
    ///  r5     .  mse    .    .  SNE    K  SNW    .    .    .
    ///  r6     .    .    .  MNW    .    B    .    .  MNE    .
    ///  r7     .  MNE    .    .    .    .    .  MSE    .    .
    /// </code>
    /// </summary>
    public static readonly BoardLayout Zenith = Setup("Zenith",
    [
        Pharaoh(5, 5),
        Obelisk(4, 5),
        Obelisk(6, 5),
        Djed(5, 4, Orientation.NE),
        Djed(5, 6, Orientation.NW),
        Pyr(2, 8, Orientation.NW),
        Pyr(4, 3, Orientation.NW),
        Pyr(4, 7, Orientation.NE),
        Pyr(6, 3, Orientation.NW),
        Pyr(6, 8, Orientation.NE),
        Pyr(7, 1, Orientation.NE),
        Pyr(7, 7, Orientation.SE),
    ]);

    /// <summary>
    /// Dusk — tight and aggressive. Both armies are packed into the middle rows, and each opening
    /// beam is already in play: P1's turns off its forward pyramid at (2,9), crosses P2's side and
    /// is sent off the top edge by P2's djed at (2,7) (P2's mirrors it through (5,0) and (5,2)). A
    /// careless first move can hand the opponent a winning reply.
    /// <code>
    ///        c0   c1   c2   c3   c4   c5   c6   c7   c8   c9
    ///  r0     .    .    .    .    .    .    .    .    .    .
    ///  r1     .    .  mnw    k    .    .  msw    .    .    .
    ///  r2     .  mse    .    b    b    .    .  ssw    .  MSW
    ///  r3     .    .  msw  mse    .  MNW  sse    .    .    .
    ///  r4     .    .    .  SNW  mse    .  MNW  MNE    .    .
    ///  r5   mne    .  SNE    .    .    B    B    .  MNW    .
    ///  r6     .    .    .  MNE    .    .    K  MSE    .    .
    ///  r7     .    .    .    .    .    .    .    .    .    .
    /// </code>
    /// </summary>
    public static readonly BoardLayout Dusk = Setup("Dusk",
    [
        Pharaoh(6, 6),
        Obelisk(5, 5),
        Obelisk(5, 6),
        Djed(4, 3, Orientation.NW),
        Djed(5, 2, Orientation.NE),
        Pyr(2, 9, Orientation.SW), // P1's opening beam turns here, straight into P2's half
        Pyr(3, 5, Orientation.NW),
        Pyr(4, 6, Orientation.NW),
        Pyr(4, 7, Orientation.NE),
        Pyr(5, 8, Orientation.NW),
        Pyr(6, 3, Orientation.NE),
        Pyr(6, 7, Orientation.SE),
    ]);

    private static readonly IReadOnlyDictionary<string, BoardLayout> ByName =
        new[] { Dawn, Zenith, Dusk }.ToDictionary(l => l.Name, StringComparer.OrdinalIgnoreCase);

    private static readonly IReadOnlyDictionary<string, BoardLayout> RotatingByName =
        ByName.Values.ToDictionary(l => l.Name, WithRotatingEmitters, StringComparer.OrdinalIgnoreCase);

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
    /// derived Sphinx/Anubis board when the ruleset has a rotating emitter, the authored one
    /// otherwise. Throws <see cref="UnknownBoardLayoutException"/> if the name is unknown.
    /// </summary>
    public static BoardLayout For(string name, RuleSet rules) =>
        (rules.RotatingSphinx ? RotatingByName : ByName).TryGetValue(name, out var layout)
            ? layout
            : throw new UnknownBoardLayoutException(name);

    /// <summary>
    /// Derives a setup's rotating-emitter arrangement from its fixed-emitter one: every obelisk
    /// becomes an Anubis on the same square, its front facing the opponent (P1's up, P2's down),
    /// and a Sphinx goes on each player's emitter corner aimed the way the fixed emitter fires —
    /// so the opening beam is the same under both rulesets.
    /// </summary>
    internal static BoardLayout WithRotatingEmitters(BoardLayout fixedEmitter) => fixedEmitter with
    {
        Pieces =
        [
            .. fixedEmitter.Pieces.Select(p => p.Kind == Piece.Obelisk
                ? p with
                {
                    Kind = Piece.Anubis,
                    Health = null,
                    Orientation = p.Owner == Player.P1 ? Orientation.NE : Orientation.SW, // faces Up / Down
                }
                : p),
            new PlacedPiece(GameEngine.EmitterFor(Player.P1).Emitter, Piece.Sphinx, Player.P1, Orientation.NE, null), // fires Up
            new PlacedPiece(GameEngine.EmitterFor(Player.P2).Emitter, Piece.Sphinx, Player.P2, Orientation.SW, null), // fires Down
        ],
    };

    /// <summary>The 180° rotation of a square: P1's (r, c) is P2's (Rows-1-r, Cols-1-c).</summary>
    internal static Coord Rotate180(Coord c) => new(GameEngine.Rows - 1 - c.Row, GameEngine.Cols - 1 - c.Col);

    /// <summary>The 180° rotation of a facing: NW↔SE, NE↔SW.</summary>
    internal static Orientation Rotate180(Orientation o) => (Orientation)(((int)o + 2) % 4);

    /// <summary>Builds a setup from P1's pieces, adding P2's half as their 180° rotation.</summary>
    /// <remarks>
    /// The dimensions come from <see cref="GameEngine"/>'s <c>const int</c> Rows/Cols, which the
    /// compiler inlines — so there is no static-init ordering hazard with GameEngine referencing
    /// this class back. Do not change Rows/Cols to <c>static readonly</c> without revisiting this.
    /// </remarks>
    private static BoardLayout Setup(string name, PlacedPiece[] p1) => new(name, GameEngine.Rows, GameEngine.Cols,
    [
        .. p1,
        .. p1.Select(p => p with
        {
            At = Rotate180(p.At),
            Owner = Player.P2,
            Orientation = p.Orientation is { } o ? Rotate180(o) : null,
        }),
    ]);

    private static PlacedPiece Pyr(int row, int col, Orientation o) =>
        new(new Coord(row, col), Piece.Pyramid, Player.P1, o, null);

    private static PlacedPiece Djed(int row, int col, Orientation o) =>
        new(new Coord(row, col), Piece.Djed, Player.P1, o, null);

    private static PlacedPiece Obelisk(int row, int col) =>
        new(new Coord(row, col), Piece.Obelisk, Player.P1, null, 2);

    private static PlacedPiece Pharaoh(int row, int col) =>
        new(new Coord(row, col), Piece.Pharaoh, Player.P1, null, null);
}

/// <summary>A game was asked for with a layout name that is not in the registry. The API surfaces it as 400.</summary>
public sealed class UnknownBoardLayoutException(string name)
    : Exception($"unknown layout '{name}'")
{
    public string Name { get; } = name;
}
