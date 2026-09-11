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
