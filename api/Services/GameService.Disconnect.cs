using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Services;

// Disconnect tracking: the only hub-facing cluster — GameHub.Join / OnDisconnectedAsync call
// ClearDisconnectedAsync / MarkDisconnectedAsync directly. Single SaveChanges, no transaction, no
// ending logic. DisconnectedAt is also read cross-cluster by ClaimAbandonmentAsync.
public sealed partial class GameService
{
    /// <summary>
    /// Clears <paramref name="seat"/>'s tracked disconnect timestamp — called by
    /// <see cref="Hubs.GameHub.Join"/> on every reconnect (which looks identical to an ordinary
    /// page-refresh rejoin, and that's fine). Returns whether that seat actually had a disconnect
    /// tracked, so the hub only broadcasts <c>opponentReconnected</c> when there was something to
    /// reconnect *from* — not on every ordinary first join. False (no-op) if no game has this id.
    /// </summary>
    public async Task<bool> ClearDisconnectedAsync(Guid id, Player seat, CancellationToken ct = default)
    {
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return false;

        var wasDisconnected = DisconnectedAt(game, seat) is not null;
        SetDisconnectedAt(game, seat, null);
        await db.SaveChangesAsync(ct);
        return wasDisconnected;
    }

    /// <summary>
    /// Stamps <paramref name="seat"/>'s disconnect timestamp to now — called by
    /// <see cref="Hubs.GameHub.OnDisconnectedAsync"/> when a tracked connection drops. Only while
    /// the game is still <c>InProgress</c> (nothing worth tracking once it's already finished);
    /// returns null (no-op) otherwise, or if no game has this id, so the hub knows not to
    /// broadcast <c>opponentDisconnected</c>.
    /// </summary>
    public async Task<DateTime?> MarkDisconnectedAsync(Guid id, Player seat, CancellationToken ct = default)
    {
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null || game.Status != GameStatus.InProgress)
            return null;

        var now = Now();
        SetDisconnectedAt(game, seat, now);
        await db.SaveChangesAsync(ct);
        return now;
    }

    private static DateTime? DisconnectedAt(Game game, Player seat) =>
        seat == Player.P1 ? game.P1DisconnectedAtUtc : game.P2DisconnectedAtUtc;

    private static void SetDisconnectedAt(Game game, Player seat, DateTime? value)
    {
        if (seat == Player.P1)
            game.P1DisconnectedAtUtc = value;
        else
            game.P2DisconnectedAtUtc = value;
    }
}
