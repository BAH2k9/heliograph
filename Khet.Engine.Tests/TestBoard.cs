using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Api.Tests.Engine;

/// <summary>Helpers for building small boards in engine tests without the full Classic layout.</summary>
internal static class TestBoard
{
    public static Board Empty() =>
        Board.Create(GameEngine.Rows, GameEngine.Cols, new Dictionary<Coord, PieceOnBoard>());

    public static Board With(params (Coord At, PieceOnBoard Piece)[] pieces) =>
        Board.Create(
            GameEngine.Rows,
            GameEngine.Cols,
            pieces.ToDictionary(p => p.At, p => p.Piece));

    public static PieceOnBoard Pyramid(Orientation o, Player p = Player.P1) => new(Piece.Pyramid, p, o, null);

    public static PieceOnBoard Djed(Orientation o, Player p = Player.P1) => new(Piece.Djed, p, o, null);

    public static PieceOnBoard Obelisk(Player p = Player.P1, int health = 2) => new(Piece.Obelisk, p, null, health);

    public static PieceOnBoard Pharaoh(Player p = Player.P1) => new(Piece.Pharaoh, p, null, null);
}
