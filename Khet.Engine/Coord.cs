namespace Khet.Engine;

/// <summary>
/// A board square. Origin (0,0) is the top-left. Row increases downward, column increases
/// to the right. Direction.Up is row-1, Down is row+1, Left is col-1, Right is col+1.
/// </summary>
public readonly record struct Coord(int Row, int Col);
