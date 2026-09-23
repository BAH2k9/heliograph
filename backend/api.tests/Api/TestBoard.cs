using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Api.Tests.Api;

/// <summary>
/// Small board fixtures for the DB-backed endpoint tests, built from the public engine API only.
/// <para>
/// This is a deliberately narrower copy of <c>Heliograph.Engine.Tests/TestBoard.cs</c> — the pure-engine
/// test project can't be referenced from here, so the few factories these integration tests need are
/// duplicated rather than shared. The two can drift silently; keep them in sync, and if a second
/// module extraction needs the same helper on both sides of an assembly line, promote it into a
/// shared test-support project instead of copying it a third time. See Follow-up E in the
/// extraction plan.
/// </para>
/// </summary>
internal static class TestBoard
{
    public static Board With(params (Coord At, PieceOnBoard Piece)[] pieces) =>
        Board.Create(GameEngine.Rows, GameEngine.Cols, pieces.ToDictionary(p => p.At, p => p.Piece));

    public static PieceOnBoard Pyramid(Orientation o, Player p = Player.P1) => new(Piece.Pyramid, p, o, null);

    public static PieceOnBoard Pharaoh(Player p = Player.P1) => new(Piece.Pharaoh, p, null, null);

    public static PieceOnBoard Obelisk(Player p = Player.P1, int health = 2) => new(Piece.Obelisk, p, null, health);
}
