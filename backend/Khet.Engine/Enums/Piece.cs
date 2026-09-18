namespace Khet.Engine.Enums;

public enum Piece
{
    Pyramid,
    Obelisk,
    Djed,
    Pharaoh,

    /// <summary>
    /// The rotating laser source of Khet 2.0. Sits on its owner's corner square, never moves,
    /// cannot be captured; a turn spent on it flips it between its two board-facing orientations.
    /// Present only in layouts built for the <c>Khet2</c> ruleset.
    /// </summary>
    Sphinx,

    /// <summary>
    /// The directional blocker of Khet 2.0 (replaces the stacked obelisks in that ruleset's
    /// layouts). Moves and rotates like a pyramid. Its front face — the direction its
    /// <c>Orientation</c> faces — absorbs a laser hit and survives; a hit on any other face
    /// destroys it, exactly like a pyramid struck on a blank face.
    /// </summary>
    Anubis
}
