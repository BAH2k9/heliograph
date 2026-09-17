namespace Khet.Api.Domain;

/// <summary>
/// Lifecycle of a <see cref="MatchInvite"/>. <see cref="Pending"/> is the only state anyone can act
/// on; <see cref="Accepted"/>/<see cref="Declined"/>/<see cref="Expired"/> are all terminal. Unlike
/// <see cref="Friendship"/>'s declined-request-is-just-deleted rule, a resolved invite is kept
/// (not deleted) so <c>GET /api/invites/pending</c> and any future "invite history" view can tell
/// the three terminal outcomes apart — there's no unbounded growth risk here the way a busy
/// friends graph might have, so there's no pressure to prune.
/// </summary>
public enum MatchInviteStatus
{
    Pending,
    Accepted,
    Declined,
    Expired,
}

/// <summary>
/// A "challenge a friend to a match" invite — see <c>backlog/07-friend-invites-matches.md</c>. Carries
/// the full game configuration up front; no <see cref="Game"/> row exists until
/// <c>InviteService.AcceptAsync</c> creates one, so a declined/expired invite never leaves an orphan
/// game (owner decision: "room created on accept, not on send"). <see cref="ExpiresAtUtc"/> is
/// re-checked server-side at accept time (CLAUDE.md's "claim" pattern) — there is deliberately no
/// background sweeper that proactively flips stale rows to <see cref="MatchInviteStatus.Expired"/>;
/// that only happens lazily, the moment an accept attempt discovers a row is stale.
/// </summary>
public class MatchInvite
{
    public Guid Id { get; set; }

    public Guid InviterId { get; set; }

    public Guid InviteeId { get; set; }

    /// <summary>Name of the rule variant (<c>RuleSets.For</c>) — resolved/validated at send time, same as <c>CreateRoomRequest.Ruleset</c>.</summary>
    public string Ruleset { get; set; } = "Classic";

    /// <summary>Name of the starting layout (<c>BoardLayouts.For</c>) — resolved/validated at send time, same as <c>CreateRoomRequest.Layout</c>.</summary>
    public string Layout { get; set; } = "Classic";

    /// <summary>Name of the time control preset (<c>TimeControls.For</c>), or null for untimed — same as <c>CreateRoomRequest.TimeControl</c>.</summary>
    public string? TimeControl { get; set; }

    /// <summary>
    /// Whether accepting this invite creates a rated game — chosen explicitly by the inviter at
    /// send time (owner decision: "the inviter chooses per invite, no fixed default"). Unlike
    /// <see cref="Game.Rated"/>, which infers rated-ness from both seats being account holders,
    /// <c>InviteService.AcceptAsync</c> sets <see cref="Game.Rated"/> from this flag directly — both
    /// seats are account holders here by construction (a friendship requires two accounts), so the
    /// inference would always say true anyway; this field is what lets the inviter opt out.
    /// </summary>
    public bool Rated { get; set; }

    public MatchInviteStatus Status { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    /// <summary>
    /// Fixed 5-minute TTL from <see cref="CreatedAtUtc"/> (<c>InviteService.InviteTtl</c>) — an
    /// implementation judgment call per the plan, not an owner decision. Re-checked server-side by
    /// <c>InviteService.AcceptAsync</c>; never trusted from the client.
    /// </summary>
    public DateTime ExpiresAtUtc { get; set; }

    /// <summary>Set when <see cref="Status"/> leaves <see cref="MatchInviteStatus.Pending"/> to <see cref="MatchInviteStatus.Accepted"/> — the game the accept created.</summary>
    public Guid? GameId { get; set; }
}
