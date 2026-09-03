using Khet.Api.Contracts;
using Khet.Api.Domain.Enums;

namespace Khet.Api.Domain;

/// <summary>
/// A game of Khet. <see cref="State"/> is the single, current board snapshot (jsonb); the
/// full history is in <see cref="Moves"/>. One transaction per move rewrites <see cref="State"/>
/// and appends a <see cref="Move"/> row.
/// </summary>
public class Game
{
    public Guid Id { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public GameStatus Status { get; set; }

    public Player CurrentTurn { get; set; }

    public int MoveCount { get; set; }

    /// <summary>Engine rules version the stored <see cref="State"/> was produced by. Guards against silent reinterpretation if the engine changes.</summary>
    public int RulesVersion { get; set; } = 1;

    public BoardState State { get; set; } = default!;

    public List<Move> Moves { get; set; } = [];
}
