using System.Collections.Concurrent;
using Khet.Engine.Enums;

namespace Khet.Api.Hubs;

/// <summary>
/// In-memory map of live SignalR connection id -> which game/seat that connection is presenting
/// as, so <see cref="GameHub.OnDisconnectedAsync"/> can tell whose seat just dropped without a DB
/// round trip. Registered as a DI singleton (one instance for the whole server process) and
/// injected into <see cref="GameHub"/>. Only ever mutated by <see cref="GameHub.Join"/> (adds) and
/// <see cref="GameHub.OnDisconnectedAsync"/> (removes) — see plans/02-disconnect-abandonment.md.
/// Presence bookkeeping only: it never itself decides anything about a game's state, and it is
/// never persisted — a server restart forgets every entry, which is fine (any connection that was
/// alive across the restart will reconnect and re-<see cref="GameHub.Join"/> anyway).
/// </summary>
public sealed class GameConnectionTracker
{
    private readonly ConcurrentDictionary<string, (Guid GameId, Player Seat)> _connections = new();

    /// <summary>Records (or overwrites) this connection's game/seat. Safe to call repeatedly for the same connection.</summary>
    public void Track(string connectionId, Guid gameId, Player seat) =>
        _connections[connectionId] = (gameId, seat);

    /// <summary>Removes and returns the tracked entry for this connection, if any was tracked.</summary>
    public bool TryRemove(string connectionId, out (Guid GameId, Player Seat) entry) =>
        _connections.TryRemove(connectionId, out entry);
}
