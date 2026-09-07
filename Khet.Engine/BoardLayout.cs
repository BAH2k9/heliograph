using Khet.Engine.Enums;

namespace Khet.Engine;

/// <summary>
/// One piece in a starting position. <see cref="Health"/> is the obelisk stack height
/// (2, then 1), null for every other kind — mirrors <see cref="PieceOnBoard"/>.
/// </summary>
public sealed record PlacedPiece(Coord At, Piece Kind, Player Owner, Orientation? Orientation, int? Health);

/// <summary>
/// A named starting position. Deliberately a value, not an enum: a puzzle (later) can build an
/// ad-hoc <see cref="BoardLayout"/> and hand it straight to the engine with no new enum member.
/// </summary>
public sealed record BoardLayout(string Name, int Rows, int Cols, IReadOnlyList<PlacedPiece> Pieces)
{
    /// <summary>Materialises the layout into an immutable <see cref="Board"/>.</summary>
    public Board Build() => Board.Create(
        Rows,
        Cols,
        Pieces.Select(p => new KeyValuePair<Coord, PieceOnBoard>(
            p.At,
            new PieceOnBoard(p.Kind, p.Owner, p.Orientation, p.Health))));
}
