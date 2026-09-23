namespace Heliograph.Engine.Enums;

public enum MoveKind
{
    Move,
    Rotate,

    /// <summary>Merge an owned single bastion onto an adjacent owned single bastion (Classic stacking).</summary>
    Stack,

    /// <summary>Split a two-high bastion, dropping one onto an adjacent empty square (Classic stacking).</summary>
    Unstack
}
