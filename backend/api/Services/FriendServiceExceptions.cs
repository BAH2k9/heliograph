namespace Heliograph.Api.Services;

// Thrown by FriendService, caught and mapped to HTTP status codes by FriendsController — same
// exception-per-failure-mode shape as GameServiceExceptions/RoomServiceExceptions.

/// <summary>Thrown by <see cref="FriendService.RequestAsync"/>: 400 — <c>addresseeId</c> doesn't exist or equals the caller's own id.</summary>
public sealed class UnknownUserException(string reason) : Exception(reason);

/// <summary>
/// Thrown by <see cref="FriendService.RequestAsync"/>: always 409 — either the two accounts are
/// already friends, or a request is already pending in the same direction. (The reverse-direction
/// case isn't an error at all — see <see cref="FriendService"/>'s doc comment on implicit accept.)
/// </summary>
public sealed class AlreadyFriendsException(string reason) : Exception(reason);

/// <summary>
/// Thrown by <see cref="FriendService.AcceptAsync"/>/<see cref="FriendService.DeclineAsync"/>: no
/// pending request with that id has the caller as its addressee. The controller maps this to 404,
/// not 400/403 — from the caller's point of view a request they can't act on doesn't exist.
/// </summary>
public sealed class FriendRequestNotFoundException(string reason) : Exception(reason);
