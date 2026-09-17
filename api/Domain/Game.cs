using Khet.Contracts;
using Khet.Engine.Enums;

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
    /// <c>RoomService.CreateRoomAsync</c> at room creation.
    /// </summary>
    public Guid? P1UserId { get; set; }

    /// <summary>The account seated as P2, or null for an anonymous/local seat. See <see cref="P1UserId"/>.</summary>
    public Guid? P2UserId { get; set; }

    /// <summary>
    /// Whether this game counts toward both players' Elo when it finishes. Decided once, at the
    /// moment both seats were filled through the normal authenticated create/join room flow — set
    /// true right then by <c>RoomService.JoinRoomAsync</c> if both <see cref="P1UserId"/> and
    /// <see cref="P2UserId"/> were already non-null. Never flips true retroactively.
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

    /// <summary>
    /// Name of the time control preset (<c>TimeControls.For</c>) this room's clock runs under, or
    /// null for an untimed game. Clock is multiplayer-room-only: never set on a game created via
    /// <c>POST /api/games</c> (local/offline play stays clockless). Initialized by
    /// <c>RoomService.JoinRoomAsync</c> when <see cref="SeatsTaken"/> hits 2 — not at room
    /// creation, so the creator doesn't burn time waiting for a joiner.
    /// </summary>
    public string? TimeControl { get; set; }

    /// <summary>
    /// P1's banked remaining time, in milliseconds. Null for an untimed game and for Daily (which
    /// has no balance — see <see cref="TurnDeadlineUtc"/>). Set from <see cref="Khet.Clock.TimeControl.InitialSeconds"/>
    /// when the clock initializes, updated after each of P1's accepted moves via <see cref="Khet.Clock.ClockMath.AfterMove"/>.
    /// </summary>
    public long? P1RemainingMs { get; set; }

    /// <summary>P2's banked remaining time, in milliseconds. See <see cref="P1RemainingMs"/>.</summary>
    public long? P2RemainingMs { get; set; }

    /// <summary>
    /// When the current mover's clock started running. Null for an untimed game. Reset to the
    /// timestamp of the previous move (or clock initialization, for the game's first move) every
    /// time <see cref="CurrentTurn"/> changes.
    /// </summary>
    public DateTime? TurnStartedAtUtc { get; set; }

    /// <summary>
    /// Forfeit-if-not-moved-by time — drives all timeout detection (<see cref="Khet.Clock.ClockMath.HasExpired"/>),
    /// identically for live and Daily categories. Live: <see cref="TurnStartedAtUtc"/> plus the
    /// mover's remaining time. Daily: <see cref="TurnStartedAtUtc"/> plus
    /// <see cref="Khet.Clock.TimeControl.DaysPerMove"/> (no balance — it just resets every move). Null
    /// for an untimed game.
    /// </summary>
    public DateTime? TurnDeadlineUtc { get; set; }

    /// <summary>
    /// Why an already-finished game ended: <c>"Pharaoh"</c>, <c>"Timeout"</c>, or
    /// <c>"Abandonment"</c>. Null while <see cref="Status"/> is <c>InProgress</c>, and null for a
    /// game that finished before this column existed. Distinguishes a timeout/abandonment loss
    /// from an ordinary win in the archive — without it those look identical to a normal
    /// <c>P1Win</c>/<c>P2Win</c>.
    /// </summary>
    public string? EndReason { get; set; }

    /// <summary>
    /// When P1's SignalR connection was last observed to drop while this game was
    /// <c>InProgress</c> (<see cref="Hubs.GameHub.OnDisconnectedAsync"/>), or null if P1 is
    /// currently connected (or never has been). Cleared back to null the moment P1 calls
    /// <see cref="Hubs.GameHub.Join"/> again (<see cref="Hubs.GameHub.Join"/>'s doc comment) —
    /// covers both a genuine reconnect and an ordinary page refresh, since both look identical to
    /// the hub. Drives <c>POST /api/games/{id}/claim-abandonment</c>'s authoritative 45s check —
    /// see that endpoint's doc comment. Not itself a source of truth for anything else; the claim
    /// endpoint is what actually ends the game (CLAUDE.md's "claim pattern").
    /// </summary>
    public DateTime? P1DisconnectedAtUtc { get; set; }

    /// <summary>P2's counterpart to <see cref="P1DisconnectedAtUtc"/>.</summary>
    public DateTime? P2DisconnectedAtUtc { get; set; }

    /// <summary>
    /// Which seat the server plays, or null for an ordinary human-vs-human game. Set once at
    /// creation by <c>GameService.CreateBotGameAsync</c> and never changed afterward. A bot occupies
    /// a seat directly rather than a <see cref="JoinCode"/> room with a bot-filled seat (owner
    /// decision — rooms exist to be joined by a second human over a code; a bot never joins that
    /// way). <see cref="Rated"/> must never be true when this is set — bot games are always
    /// anonymous/unrated, matching local/solo play via <c>POST /api/games</c>.
    /// </summary>
    public Player? BotSeat { get; set; }

    /// <summary>
    /// <c>BotDifficulties.For</c> name ("Easy"/"Medium"/"Hard") driving <c>BotService.ChooseMove</c>
    /// for <see cref="BotSeat"/>'s moves. Null iff <see cref="BotSeat"/> is null — the two are set
    /// and cleared together, never independently.
    /// </summary>
    public string? BotDifficulty { get; set; }

    /// <summary>
    /// When P1 last requested a rematch on this (finished) game, via
    /// <c>RoomService.RequestRematchAsync</c>. Null if P1 hasn't asked, or after
    /// <c>RoomService.DeclineRematchAsync</c> resets both seats. Once both
    /// <see cref="P1RematchRequestedAtUtc"/> and <see cref="P2RematchRequestedAtUtc"/> are set, the
    /// second request to arrive creates the new room and stamps <see cref="RematchGameId"/> — see
    /// that method's doc comment for the propose/match shape (no separate "accept" step: each
    /// seat's own request doubles as its consent).
    /// </summary>
    public DateTime? P1RematchRequestedAtUtc { get; set; }

    /// <summary>P2's counterpart to <see cref="P1RematchRequestedAtUtc"/>.</summary>
    public DateTime? P2RematchRequestedAtUtc { get; set; }

    /// <summary>
    /// The new room game created once both seats requested a rematch on this one, or null before
    /// that (or if nobody has). Set once and never cleared — a rematch is only ever created once
    /// per finished game; a later re-request on this same (now stale) game just returns the same
    /// room again, idempotently. Surfaced on <c>GameResponse</c> so a client that missed the
    /// <c>rematchReady</c> hub push still finds the new room on its next <c>GET</c>.
    /// </summary>
    public Guid? RematchGameId { get; set; }
}
