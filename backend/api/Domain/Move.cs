using Khet.Contracts;
using Khet.Engine.Enums;

namespace Khet.Api.Domain;

/// <summary>
/// One played move, append-only. <see cref="MoveNumber"/> is 1-based and equals the owning
/// game's <c>MoveCount</c> after this move. <see cref="LaserResult"/> (jsonb) is the full
/// trace of the laser that fired at the end of the move.
/// </summary>
public class Move
{
    public Guid Id { get; set; }

    public Guid GameId { get; set; }

    public Game Game { get; set; } = default!;

    public int MoveNumber { get; set; }

    public Player Player { get; set; }

    public MoveKind Type { get; set; }

    public int FromRow { get; set; }

    public int FromCol { get; set; }

    public int? ToRow { get; set; }

    public int? ToCol { get; set; }

    public RotationDir? RotationDir { get; set; }

    public LaserResult LaserResult { get; set; } = default!;

    public DateTime CreatedAtUtc { get; set; }
}
