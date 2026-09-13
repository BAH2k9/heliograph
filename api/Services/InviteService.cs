using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Clock;
using Khet.Contracts;
using Khet.Engine;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using static Khet.Api.Services.GameHelpers;

namespace Khet.Api.Services;

/// <summary>
/// "Challenge a friend to a match" — see <c>plans/07-friend-invites-matches.md</c>. Registered
/// <c>AddScoped</c>, same reasoning as <see cref="FriendService"/>/<see cref="RoomService"/>: mutates
/// tracked <see cref="MatchInvite"/> rows (and, on accept, a new <see cref="Game"/> row) on the
/// request <see cref="KhetDbContext"/>. Depends on <see cref="RoomService"/> for the one thing this
/// class must not duplicate — <see cref="RoomService.CreateGameWithCodeAsync"/>'s ruleset/layout/
/// time-control handling and join-code retry loop — and on <see cref="GameClockLifecycle"/> to start
/// the new game's clock exactly the way <see cref="RoomService.JoinRoomAsync"/> does.
///
/// <see cref="SendAsync"/> validates the requested ruleset/layout/time control and the
/// accepted-friendship requirement up front, at send time — an invite that was valid when sent stays
/// acceptable even if something about the caller's friendship changed later (unfriending doesn't
/// retroactively revoke an already-sent invite; not worth the extra query on the accept path for a
/// corner case with no real stakes). <see cref="AcceptAsync"/> is the one method with a real
/// transaction: it re-checks <see cref="MatchInvite.ExpiresAtUtc"/> server-side (CLAUDE.md's "claim"
/// pattern — no background sweeper ever proactively expires a row) before creating the game, seating
/// <see cref="MatchInvite.InviterId"/>/<see cref="MatchInvite.InviteeId"/> randomly as P1/P2 (owner
/// decision: "first move: random" — Khet always starts with P1 to move, so randomizing the seat
/// assignment is how that decision actually manifests) and setting <see cref="Game.Rated"/> from the
/// invite's own <see cref="MatchInvite.Rated"/> flag rather than <see cref="RoomService.JoinRoomAsync"/>'s
/// usual both-seats-are-accounts inference (which would always say true here anyway, since a
/// friend-invite match always has two account holders — this is what actually lets the inviter's
/// per-invite toggle matter).
/// </summary>
public sealed class InviteService(KhetDbContext db, TimeProvider time, RoomService rooms, GameClockLifecycle clock)
{
    /// <summary>
    /// Implementation judgment call, not an owner decision (the plan explicitly leaves the exact TTL
    /// unpinned) — 5 minutes is long enough that a client on another page still has time to notice
    /// the <c>inviteReceived</c> toast, short enough that a stale invite doesn't linger indefinitely.
    /// </summary>
    private static readonly TimeSpan InviteTtl = TimeSpan.FromMinutes(5);

    private DateTime Now() => time.GetUtcNow().UtcDateTime;

    /// <summary>
    /// Throws <see cref="NotFriendsException"/> (→ 400) if the invitee isn't an accepted friend of
    /// the caller (this also covers inviting yourself — never a friend relationship). Throws the
    /// same <see cref="UnknownRuleSetException"/>/<see cref="UnknownBoardLayoutException"/>/
    /// <see cref="UnknownTimeControlException"/> (→ 400) as <see cref="RoomService.CreateRoomAsync"/>
    /// for an unknown preset name — reuses <c>GameHelpers.Resolve</c>/<c>GameHelpers.ResolveTimeControl</c>
    /// rather than re-implementing that validation.
    /// </summary>
    public async Task<MatchInviteResponse> SendAsync(Guid callerId, MatchInviteCreateRequest request, CancellationToken ct = default)
    {
        var areFriends = callerId != request.InviteeUserId && await db.Friendships.AnyAsync(f =>
            f.Status == FriendshipStatus.Accepted &&
            ((f.RequesterId == callerId && f.AddresseeId == request.InviteeUserId) ||
             (f.RequesterId == request.InviteeUserId && f.AddresseeId == callerId)), ct);
        if (!areFriends)
            throw new NotFriendsException($"{request.InviteeUserId} is not an accepted friend");

        var (ruleset, layout) = Resolve(request.Ruleset, request.Layout);
        var timeControl = ResolveTimeControl(request.TimeControl);

        var now = Now();
        var invite = new MatchInvite
        {
            Id = Guid.NewGuid(),
            InviterId = callerId,
            InviteeId = request.InviteeUserId,
            Ruleset = ruleset,
            Layout = layout,
            TimeControl = timeControl,
            Rated = request.Rated,
            Status = MatchInviteStatus.Pending,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.Add(InviteTtl),
        };
        db.MatchInvites.Add(invite);
        await db.SaveChangesAsync(ct);

        return new MatchInviteResponse(invite.Id, invite.ExpiresAtUtc);
    }

    /// <summary>
    /// Accepts a pending invite: creates the room game (via <see cref="RoomService.CreateGameWithCodeAsync"/>),
    /// seats <see cref="MatchInvite.InviterId"/>/<see cref="MatchInvite.InviteeId"/> randomly as
    /// P1/P2, sets <see cref="Game.Rated"/> from the invite, initializes the clock, and flips the
    /// invite to <see cref="MatchInviteStatus.Accepted"/> — all in one transaction, mirroring
    /// <see cref="RoomService.JoinRoomAsync"/>'s own transaction shape. Throws
    /// <see cref="UnknownInviteException"/> (→ 404) if no such invite exists or it isn't pending,
    /// <see cref="NotYourInviteException"/> (→ 403) if the caller isn't the invitee, or
    /// <see cref="InviteExpiredException"/> (→ 410) if it's pending but past
    /// <see cref="MatchInvite.ExpiresAtUtc"/> — that last check also flips <see cref="MatchInvite.Status"/>
    /// to <see cref="MatchInviteStatus.Expired"/> as a side effect (the claim pattern: expiry is only
    /// ever discovered lazily, right here, never by a background sweeper).
    ///
    /// Also returns the inviter's own id and seat alongside the caller's <see cref="RoomResponse"/> —
    /// <see cref="Controllers.InvitesController.Accept"/> uses that pair to push <c>inviteAccepted</c>
    /// to the inviter's <c>user:{id}</c> group (same RoomResponse shape the invitee gets back over
    /// REST), since the inviter is otherwise never told their invite was accepted and is left sitting
    /// on the "waiting for them to accept" screen forever.
    /// </summary>
    public async Task<(RoomResponse Response, Guid InviterId, string InviterSeat)> AcceptAsync(Guid callerId, Guid inviteId, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var invite = await LoadPendingInviteAsync(callerId, inviteId, ct);

        var now = Now();
        if (now > invite.ExpiresAtUtc)
        {
            invite.Status = MatchInviteStatus.Expired;
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            throw new InviteExpiredException($"invite {inviteId} expired at {invite.ExpiresAtUtc:O}");
        }

        // "First move: random" — Khet always starts with P1 to move, so this is how the random
        // assignment actually lands: whichever of inviter/invitee is picked as P1 moves first.
        var inviterIsP1 = Random.Shared.Next(2) == 0;
        var p1UserId = inviterIsP1 ? invite.InviterId : invite.InviteeId;
        var p2UserId = inviterIsP1 ? invite.InviteeId : invite.InviterId;

        var game = await rooms.CreateGameWithCodeAsync(
            invite.Ruleset, invite.Layout, invite.TimeControl, invite.Rated,
            p1UserId, p2UserId, seatsTaken: 2, ct);
        clock.InitializeClock(game, now);
        await db.SaveChangesAsync(ct);

        invite.Status = MatchInviteStatus.Accepted;
        invite.GameId = game.Id;
        await db.SaveChangesAsync(ct);

        await transaction.CommitAsync(ct);

        var callerSeat = callerId == p1UserId ? Player.P1 : Player.P2;
        var inviterSeat = callerSeat == Player.P1 ? Player.P2 : Player.P1;
        var response = new RoomResponse(game.Id, game.JoinCode!, callerSeat.ToString());
        return (response, invite.InviterId, inviterSeat.ToString());
    }

    /// <summary>Same auth shape as <see cref="AcceptAsync"/> (minus the expiry check — declining an already-stale invite is harmless); sets <see cref="MatchInviteStatus.Declined"/>.</summary>
    public async Task DeclineAsync(Guid callerId, Guid inviteId, CancellationToken ct = default)
    {
        var invite = await LoadPendingInviteAsync(callerId, inviteId, ct);
        invite.Status = MatchInviteStatus.Declined;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Pending invites where the caller is the invitee and still actually pending
    /// (<see cref="MatchInvite.ExpiresAtUtc"/> not yet passed) — the fallback list a client re-fetches
    /// on an <c>inviteReceived</c> push, or on load to catch up on anything missed while
    /// disconnected. Never flips a stale row to <see cref="MatchInviteStatus.Expired"/> itself (that
    /// only happens lazily in <see cref="AcceptAsync"/>) — a listing read has no business mutating state.
    /// </summary>
    public async Task<IReadOnlyList<PendingMatchInvite>> ListPendingAsync(Guid callerId, CancellationToken ct = default)
    {
        var now = Now();
        var invites = await db.MatchInvites.AsNoTracking()
            .Where(i => i.InviteeId == callerId && i.Status == MatchInviteStatus.Pending && i.ExpiresAtUtc > now)
            .OrderBy(i => i.CreatedAtUtc)
            .ToListAsync(ct);

        var inviterIds = invites.Select(i => i.InviterId).ToList();
        var invitersById = await db.Users.AsNoTracking()
            .Where(u => inviterIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, ct);

        return invites.Select(i =>
        {
            var inviter = invitersById[i.InviterId];
            return new PendingMatchInvite(
                i.Id, i.InviterId, inviter.DisplayName, inviter.Discriminator, inviter.AvatarId,
                i.Ruleset, i.Layout, i.TimeControl, i.Rated, i.CreatedAtUtc, i.ExpiresAtUtc);
        }).ToList();
    }

    /// <summary>
    /// Not-yet-consumed invites where the caller is the *inviter* — <see cref="MatchInviteStatus.Pending"/>
    /// or <see cref="MatchInviteStatus.Accepted"/>, both bounded by the same <see cref="MatchInvite.ExpiresAtUtc"/>
    /// the invite was created with. The REST fallback backing <c>GET /api/invites/sent</c>, polled by
    /// the "waiting for them to accept" screen so a missed <c>inviteAccepted</c> push (no live hub
    /// connection at push time, or the tab having reloaded since) isn't permanently unrecoverable —
    /// see <see cref="SentMatchInvite"/>'s own doc comment. Bounding <see cref="MatchInviteStatus.Accepted"/>
    /// rows by the same expiry (rather than returning them forever) matters even though the row itself
    /// never mutates again after accept: the frontend poll matches "any accepted invite with a room",
    /// so an unbounded <see cref="MatchInviteStatus.Accepted"/> row would keep resurrecting an
    /// arbitrarily old already-finished game every time this screen mounts. Declined/expired invites
    /// are never returned; there's nothing left for the sender to act on.
    /// </summary>
    public async Task<IReadOnlyList<SentMatchInvite>> ListSentAsync(Guid callerId, CancellationToken ct = default)
    {
        var now = Now();
        var invites = await db.MatchInvites.AsNoTracking()
            .Where(i => i.InviterId == callerId &&
                i.ExpiresAtUtc > now &&
                (i.Status == MatchInviteStatus.Accepted || i.Status == MatchInviteStatus.Pending))
            .OrderBy(i => i.CreatedAtUtc)
            .ToListAsync(ct);

        var gameIds = invites.Where(i => i.GameId is not null).Select(i => i.GameId!.Value).ToList();
        var gamesById = await db.Games.AsNoTracking()
            .Where(g => gameIds.Contains(g.Id))
            .ToDictionaryAsync(g => g.Id, ct);

        return invites.Select(i =>
        {
            if (i.Status != MatchInviteStatus.Accepted || i.GameId is not Guid gameId || !gamesById.TryGetValue(gameId, out var game))
                return new SentMatchInvite(i.Id, i.Status.ToString(), null);

            var seat = game.P1UserId == callerId ? Player.P1 : Player.P2;
            return new SentMatchInvite(i.Id, i.Status.ToString(), new RoomResponse(game.Id, game.JoinCode!, seat.ToString()));
        }).ToList();
    }

    private async Task<MatchInvite> LoadPendingInviteAsync(Guid callerId, Guid inviteId, CancellationToken ct)
    {
        var invite = await db.MatchInvites.FirstOrDefaultAsync(i => i.Id == inviteId, ct)
            ?? throw new UnknownInviteException($"no invite with id {inviteId}");
        if (invite.Status != MatchInviteStatus.Pending)
            throw new UnknownInviteException($"invite {inviteId} is no longer pending");
        if (invite.InviteeId != callerId)
            throw new NotYourInviteException($"caller is not the invitee of invite {inviteId}");
        return invite;
    }
}
