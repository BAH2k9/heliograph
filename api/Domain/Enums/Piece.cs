namespace Khet.Api.Domain.Enums;

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
    Sphinx
}
