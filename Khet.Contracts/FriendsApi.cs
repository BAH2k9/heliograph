namespace Khet.Contracts;

/// <summary>One hit from <c>GET /api/users/search</c>. <see cref="Discriminator"/> only ever renders
/// alongside <see cref="DisplayName"/> here — never appended to it elsewhere in the app.</summary>
public sealed record UserSearchResult(Guid Id, string DisplayName, string Discriminator, string? AvatarId);

/// <summary>Body of <c>POST /api/friends/requests</c>.</summary>
public sealed record FriendRequestCreate(Guid AddresseeId);

/// <summary>
/// Response of <c>POST /api/friends/requests</c>: <c>"pending"</c> (201, a new request was created)
/// or <c>"accepted"</c> (200, the reverse direction was already pending, so this call accepted it
/// instead of creating a second row — see <c>FriendService</c>'s doc comment).
/// </summary>
public sealed record FriendRequestCreateResponse(string Status);

/// <summary>One accepted friendship, returned by <c>GET /api/friends</c> and by accepting a request.</summary>
public sealed record FriendSummary(Guid UserId, string DisplayName, string Discriminator, string? AvatarId);

/// <summary>One pending request, returned by <c>GET /api/friends/requests/incoming</c>/<c>outgoing</c>.</summary>
public sealed record FriendRequestSummary(
    Guid RequestId, Guid UserId, string DisplayName, string Discriminator, string? AvatarId, DateTime CreatedAtUtc);

/// <summary>
/// Body of <c>POST /api/invites</c>. <see cref="Ruleset"/>/<see cref="Layout"/>/<see cref="TimeControl"/>
/// default the same way <see cref="CreateRoomRequest"/>'s fields do (Classic/Classic/untimed).
/// <see cref="Rated"/> has no default — the inviter always chooses explicitly (owner decision: no
/// fixed default, unlike a plain room join's rated-inference).
/// </summary>
public sealed record MatchInviteCreateRequest(
    Guid InviteeUserId, string? Ruleset, string? Layout, string? TimeControl, bool Rated);

/// <summary>Returned by <c>POST /api/invites</c> on success (201).</summary>
public sealed record MatchInviteResponse(Guid Id, DateTime ExpiresAtUtc);

/// <summary>
/// One pending invite where the caller is the invitee, returned by <c>GET /api/invites/pending</c>.
/// This is the authoritative content a client reads after an <c>inviteReceived</c> push — that push
/// carries only the invite id, never trusted as content on its own (same discipline as every other
/// hub event in this app).
/// </summary>
public sealed record PendingMatchInvite(
    Guid Id,
    Guid InviterId,
    string InviterDisplayName,
    string InviterDiscriminator,
    string? InviterAvatarId,
    string Ruleset,
    string Layout,
    string? TimeControl,
    bool Rated,
    DateTime CreatedAtUtc,
    DateTime ExpiresAtUtc);
