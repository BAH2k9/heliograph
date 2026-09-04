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

    /// <summary>
    /// When <see cref="Status"/> left <c>InProgress</c> — set once, at the same instant as the
    /// move that ended the game. Null while the game is still in progress.
    /// </summary>
    public DateTime? FinishedAtUtc { get; set; }

    public GameStatus Status { get; set; }

    public Player CurrentTurn { get; set; }

    public int MoveCount { get; set; }

    /// <summary>
    /// Short shareable code for a realtime room, or null for a game created directly via
    /// <c>POST /api/games</c>. Unique when set. The code is the only capability token — there
    /// is no account auth.
    /// </summary>
    public string? JoinCode { get; set; }

    /// <summary>
    /// How many of the two seats have been claimed. The room creator takes <c>P1</c> (1); the
    /// first joiner takes <c>P2</c> (2); everyone after that spectates. Not meaningful for
    /// non-room games.
    /// </summary>
    public int SeatsTaken { get; set; }

    /// <summary>Engine rules version the stored <see cref="State"/> was produced by. Guards against silent reinterpretation if the engine changes.</summary>
    public int RulesVersion { get; set; } = 1;

    /// <summary>
    /// The account seated as P1, or null for an anonymous/local seat. Only ever set by
    /// <c>GameService.CreateRoomAsync</c> at room creation, or later attached (without affecting
    /// <see cref="Rated"/>) via <c>GameService.ClaimSeatAsync</c> when a player who was anonymous
    /// mid-game logs in — the owner wants that game to show up in their archive, just not count
    /// toward rating.
    /// </summary>
    public Guid? P1UserId { get; set; }

    /// <summary>The account seated as P2, or null for an anonymous/local seat. See <see cref="P1UserId"/>.</summary>
    public Guid? P2UserId { get; set; }

    /// <summary>
    /// Whether this game counts toward both players' Elo when it finishes. Decided once, at the
    /// moment both seats were filled through the normal authenticated create/join room flow — set
    /// true right then by <c>GameService.JoinRoomAsync</c> if both <see cref="P1UserId"/> and
    /// <see cref="P2UserId"/> were already non-null. Never flips true retroactively: a seat claimed
    /// after the fact via <c>ClaimSeatAsync</c> attaches the account for archive purposes only.
    /// </summary>
    public bool Rated { get; set; }

    /// <summary>
    /// Name of the rule variant this game is played under (<c>RuleSets.For</c>). Chosen at
    /// creation and fixed for the life of the game. Defaults to <c>"Classic"</c>.
    /// </summary>
    public string Ruleset { get; set; } = "Classic";

    /// <summary>
    /// Name of the starting layout this game was created from (<c>BoardLayouts.For</c>). Chosen
    /// at creation; recorded so the client can render the right variant. Defaults to <c>"Classic"</c>.
    /// </summary>
    public string Layout { get; set; } = "Classic";

    public BoardState State { get; set; } = default!;

    public List<Move> Moves { get; set; } = [];
}
