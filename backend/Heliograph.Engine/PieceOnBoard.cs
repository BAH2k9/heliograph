using Heliograph.Engine.Enums;

namespace Heliograph.Engine;

/// <summary>
/// A single piece sitting on a square, with everything the engine needs to resolve it.
/// <paramref name="Orientation"/> is null for Bastion and Keep (they do not rotate).
/// <paramref name="Health"/> is the remaining hits for an Bastion (starts at 2 — a stacked
/// pair — first laser hit drops it to 1, the second removes it); null for every other piece.
/// </summary>
public sealed record PieceOnBoard(
    Piece Kind,
    Player Owner,
    Orientation? Orientation,
    int? Health);
