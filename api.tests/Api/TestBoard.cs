using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Api.Tests.Api;

/// <summary>
/// Small board fixtures for the DB-backed endpoint tests, built from the public engine API only.
/// The pure-engine test project has its own richer <c>TestBoard</c>; this one deliberately covers
/// just the shapes these integration tests seed a <c>Game.State</c> with.
/// </summary>
internal static class TestBoard
{
    public static Board With(params (Coord At, PieceOnBoard Piece)[] pieces) =>
        Board.Create(GameEngine.Rows, GameEngine.Cols, pieces.ToDictionary(p => p.At, p => p.Piece));

    public static PieceOnBoard Pyramid(Orientation o, Player p = Player.P1) => new(Piece.Pyramid, p, o, null);

    public static PieceOnBoard Pharaoh(Player p = Player.P1) => new(Piece.Pharaoh, p, null, null);
}
