namespace Heliograph.Api.Services;

// The exceptions the claim / resign paths (GameService.Endings) and the rematch path (RoomService)
// throw, caught and mapped to HTTP status codes by both GamesController and RoomsController. Split
// out of GameService.cs by the per-cluster partial split; namespace and behaviour unchanged.

/// <summary>
/// Thrown by <see cref="GameService.ClaimTimeoutAsync"/>: always 409 (Conflict) — either the game
/// has already finished, or <see cref="Domain.Game.TurnDeadlineUtc"/> genuinely hasn't passed yet.
/// </summary>
public sealed class ClaimTimeoutException(string reason) : Exception(reason);

/// <summary>
/// Thrown by <see cref="GameService.ClaimAbandonmentAsync"/>: always 409 (Conflict) — the game has
/// already finished, the other seat has no disconnect tracked at all, or it hasn't been tracked
/// long enough yet.
/// </summary>
public sealed class ClaimAbandonmentException(string reason) : Exception(reason);

/// <summary>
/// Thrown by <see cref="GameService.ResignAsync"/>: 400 (a spectator/missing seat has nothing to
/// resign) unless <see cref="Conflict"/> is set, in which case it's 409 (the game already finished).
/// </summary>
public sealed class ResignException(string reason, bool conflict = false) : Exception(reason)
{
    public bool Conflict { get; } = conflict;
}

/// <summary>
/// Thrown by <see cref="RoomService.RequestRematchAsync"/>/<see cref="RoomService.DeclineRematchAsync"/>:
/// 400 for an unknown seat or a non-room game, or 409 (<see cref="Conflict"/>) if the game the
/// rematch is requested against is still <c>InProgress</c>.
/// </summary>
public sealed class RematchException(string reason, bool conflict = false) : Exception(reason)
{
    public bool Conflict { get; } = conflict;
}

/// <summary>Thrown by <see cref="GameService.GetPlayerProfileAsync"/>: always 400 — <c>seat</c> wasn't "P1"/"P2".</summary>
public sealed class UnknownSeatException(string reason) : Exception(reason);
