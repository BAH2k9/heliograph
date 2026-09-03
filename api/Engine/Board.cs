using System.Collections.Immutable;

namespace Khet.Api.Engine;

/// <summary>
/// An immutable snapshot of the pieces on the board. Every mutating method returns a new
/// <see cref="Board"/>; the instance is never changed in place. Build one with
/// <see cref="GameEngine.CreateStartingBoard"/> or <c>BoardMapper.ToBoard</c>.
/// </summary>
public sealed class Board
{
    private readonly ImmutableDictionary<Coord, PieceOnBoard> _pieces;

    private Board(int rows, int cols, ImmutableDictionary<Coord, PieceOnBoard> pieces)
    {
        Rows = rows;
        Cols = cols;
        _pieces = pieces;
    }

    public int Rows { get; }

    public int Cols { get; }

    public IReadOnlyDictionary<Coord, PieceOnBoard> Pieces => _pieces;

    internal static Board Create(int rows, int cols, IEnumerable<KeyValuePair<Coord, PieceOnBoard>> pieces) =>
        new(rows, cols, pieces.ToImmutableDictionary());

    public bool InBounds(Coord c) => c.Row >= 0 && c.Row < Rows && c.Col >= 0 && c.Col < Cols;

    public bool TryGet(Coord c, out PieceOnBoard piece) => _pieces.TryGetValue(c, out piece!);

    public PieceOnBoard? PieceAt(Coord c) => _pieces.TryGetValue(c, out var p) ? p : null;

    public Board With(Coord c, PieceOnBoard piece) => new(Rows, Cols, _pieces.SetItem(c, piece));

    public Board Without(Coord c) => new(Rows, Cols, _pieces.Remove(c));

    public Board Swap(Coord a, Coord b)
    {
        var pieceA = _pieces[a];
        var pieceB = _pieces[b];
        return new(Rows, Cols, _pieces.SetItem(a, pieceB).SetItem(b, pieceA));
    }
}
