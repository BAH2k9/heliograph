namespace Heliograph.Engine.Enums;

public enum Piece
{
    Mirror,
    Bastion,
    Swivel,
    Keep,

    /// <summary>
    /// The rotating laser source of Turning Sun. Sits on its owner's corner square, never moves,
    /// cannot be captured; a turn spent on it flips it between its two board-facing orientations.
    /// Present only in layouts built for the <c>TurningSun</c> ruleset.
    /// </summary>
    Heliostat,

    /// <summary>
    /// The directional blocker of Turning Sun (replaces the stacked bastions in that ruleset's
    /// layouts). Moves and rotates like a mirror. Its front face — the direction its
    /// <c>Orientation</c> faces — absorbs a laser hit and survives; a hit on any other face
    /// destroys it, exactly like a mirror struck on a blank face.
    /// </summary>
    Sentinel
}
