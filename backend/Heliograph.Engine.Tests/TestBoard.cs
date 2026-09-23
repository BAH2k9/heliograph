using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Engine.Tests;

/// <summary>
/// Helpers for building small boards in engine tests without the full Classic layout.
/// <para>
/// A deliberately narrower copy lives at <c>api.tests/Api/TestBoard.cs</c> for the DB-backed
/// endpoint tests (that project references <c>Heliograph.Engine</c> only, not this test project). The two
/// can drift silently — if you add a piece factory here that the integration tests also need, add it
/// there too. If a second module extraction hits the same "helper wanted on both sides of an
/// assembly line" problem, that's the signal to promote this into a shared test-support project
/// rather than making a third copy. See Follow-up E in the extraction plan.
/// </para>
/// </summary>
internal static class TestBoard
{
    public static Board Empty() =>
        Board.Create(GameEngine.Rows, GameEngine.Cols, new Dictionary<Coord, PieceOnBoard>());

    public static Board With(params (Coord At, PieceOnBoard Piece)[] pieces) =>
        Board.Create(
            GameEngine.Rows,
            GameEngine.Cols,
            pieces.ToDictionary(p => p.At, p => p.Piece));

    public static PieceOnBoard Mirror(Orientation o, Player p = Player.P1) => new(Piece.Mirror, p, o, null);

    public static PieceOnBoard Swivel(Orientation o, Player p = Player.P1) => new(Piece.Swivel, p, o, null);

    public static PieceOnBoard Bastion(Player p = Player.P1, int health = 2) => new(Piece.Bastion, p, null, health);

    public static PieceOnBoard Keep(Player p = Player.P1) => new(Piece.Keep, p, null, null);
}
