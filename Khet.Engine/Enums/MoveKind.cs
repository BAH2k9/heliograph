namespace Khet.Engine.Enums;

public enum MoveKind
{
    Move,
    Rotate,

    /// <summary>Merge an owned single obelisk onto an adjacent owned single obelisk (Classic stacking).</summary>
    Stack,

    /// <summary>Split a two-high obelisk, dropping one onto an adjacent empty square (Classic stacking).</summary>
    Unstack
}
