namespace Khet.Api.Contracts;

/// <summary>A board square in wire form.</summary>
public sealed record CoordDto(int Row, int Col);

/// <summary>
/// One piece in wire form. Enum-valued fields are strings (e.g. "Pyramid", "P1", "NW").
/// <see cref="Orientation"/> is null for obelisks and pharaohs; <see cref="Health"/> is set
/// only for obelisks.
/// </summary>
public sealed record BoardPiece(
    int Row,
    int Col,
    string Kind,
    string Owner,
    string? Orientation,
    int? Health);

/// <summary>
/// The full board. This is both the shape stored in the <c>Game.State</c> jsonb column and
/// the board payload returned by the API — there is deliberately only one representation.
/// </summary>
public sealed record BoardState(int Rows, int Cols, IReadOnlyList<BoardPiece> Pieces);
