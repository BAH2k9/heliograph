using Khet.Api.Domain.Enums;

namespace Khet.Api.Engine;

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

    private static readonly IReadOnlyDictionary<string, BoardLayout> ByName =
        new[] { Classic }.ToDictionary(l => l.Name, StringComparer.OrdinalIgnoreCase);

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
}

/// <summary>A game was asked for with a layout name that is not in the registry. The API surfaces it as 400.</summary>
public sealed class UnknownBoardLayoutException(string name)
    : Exception($"unknown layout '{name}'")
{
    public string Name { get; } = name;
}
