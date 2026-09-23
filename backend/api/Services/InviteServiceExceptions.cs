namespace Heliograph.Api.Services;

// Thrown by InviteService, caught and mapped to HTTP status codes by InvitesController — same
// exception-per-failure-mode shape as GameServiceExceptions/RoomServiceExceptions/FriendServiceExceptions.

/// <summary>
/// Thrown by <see cref="InviteService.AcceptAsync"/>/<see cref="InviteService.DeclineAsync"/>: 404 —
/// no invite with that id exists, or it exists but is no longer <c>Pending</c> (already accepted,
/// declined, or expired). Bundled together deliberately: from the caller's point of view an invite
/// they can no longer act on doesn't exist, mirroring <c>FriendRequestNotFoundException</c>.
/// </summary>
public sealed class UnknownInviteException(string reason) : Exception(reason);

/// <summary>
/// Thrown by <see cref="InviteService.AcceptAsync"/>/<see cref="InviteService.DeclineAsync"/>: 403 —
/// the invite exists and is pending, but the caller isn't its <see cref="Domain.MatchInvite.InviteeId"/>.
/// Unlike <see cref="UnknownInviteException"/>, existence isn't hidden here: the invite id was only
/// ever handed to its actual invitee (via the pending-list/hub push), so there's nothing to leak by
/// distinguishing "not yours" from "doesn't exist".
/// </summary>
public sealed class NotYourInviteException(string reason) : Exception(reason);

/// <summary>
/// Thrown by <see cref="InviteService.AcceptAsync"/>: 410 (Gone) — the invite was still <c>Pending</c>
/// but <see cref="Domain.MatchInvite.ExpiresAtUtc"/> had already passed by the time accept was
/// called. CLAUDE.md's "claim" pattern: this is the one place expiry is actually decided, re-checked
/// server-side against the invite's own row rather than trusted from the client — there is no
/// background sweeper that proactively expires rows. Flips <see cref="Domain.MatchInvite.Status"/>
/// to <see cref="Domain.MatchInviteStatus.Expired"/> as a side effect of being thrown.
/// </summary>
public sealed class InviteExpiredException(string reason) : Exception(reason);

/// <summary>
/// Thrown by <see cref="InviteService.SendAsync"/>: 400 — the requested invitee isn't an accepted
/// friend of the caller (includes inviting yourself, which is never a friend relationship).
/// </summary>
public sealed class NotFriendsException(string reason) : Exception(reason);
