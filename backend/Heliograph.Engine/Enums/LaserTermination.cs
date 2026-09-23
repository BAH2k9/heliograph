namespace Heliograph.Engine.Enums;

/// <summary>How a fired laser beam ended.</summary>
public enum LaserTermination
{
    /// <summary>The beam left the board without being absorbed.</summary>
    ExitedBoard,

    /// <summary>The beam hit a non-reflecting face (mirror blank face, bastion) and stopped.</summary>
    Absorbed,

    /// <summary>The beam hit a keep — the game is over.</summary>
    HitKeep
}
