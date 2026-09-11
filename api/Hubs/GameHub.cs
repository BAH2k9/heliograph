using Khet.Api.Services;
using Khet.Engine.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Khet.Api.Hubs;

/// <summary>
/// Fans move results out to everyone watching a game. Mapped at <c>/api/hub</c> (under
/// <c>/api/*</c>, so Caddy already routes it). The REST <c>POST /api/games/{id}/moves</c> stays
/// the source of truth — this hub only broadcasts the <see cref="Contracts.SubmitMoveResponse"/>
/// that endpoint produced, to the group named by the game id.
///
/// Also tracks per-connection seat presence (<see cref="GameConnectionTracker"/>) to fan out
/// <c>opponentDisconnected</c>/<c>opponentReconnected</c> — see
/// plans/02-disconnect-abandonment.md. This is still fan-out only: the hub never itself ends a
/// game. <c>POST /api/games/{id}/claim-abandonment</c> remains the one place that authoritatively
/// decides an abandonment, mirroring how <c>claim-timeout</c> already avoids a server-side
/// timer/worker (CLAUDE.md's "claim pattern").
///
/// <see cref="SubscribeToUser"/> (plan <c>07-friend-invites-matches.md</c>) is a deliberate,
/// reviewed expansion of this hub's scoping model, not a quiet one: every group before it
/// (<c>gameId</c> passed to <see cref="Join"/>/<see cref="Leave"/>) scopes broadcasts to whoever is
/// watching one game. <c>user:{userId}</c> is the first group scoped to an *account* instead — it
/// exists so a friend-invite notification (<c>inviteReceived</c>, pushed by
/// <see cref="Controllers.InvitesController.Create"/>) can reach an authenticated client wherever it
/// is in the app, not just while it's sitting on a specific game's page. Still the same one SignalR
/// connection <c>realtime.ts</c> already owns — a client calls both <see cref="Join"/> (when on a
/// game) and <see cref="SubscribeToUser"/> (whenever authenticated) on it, never a second connection.
///
/// Class-level <c>[Authorize]</c>: every connection needs a valid bearer token (guest play is
/// gone), so every method below runs with a known caller identity.
/// </summary>
[Authorize]
public sealed class GameHub(GameConnectionTracker tracker, GameService games) : Hub
{
    /// <summary>
    /// Subscribes this connection to the caller's own <c>user:{userId}</c> group, so
    /// <c>inviteReceived</c> (and any future account-scoped push) reaches it regardless of what
    /// page — or which game, if any — the client currently has open. The caller id comes from the
    /// already-validated bearer token's own <c>sub</c> claim (<see cref="JwtRegisteredClaimNames.Sub"/>,
    /// read the same way <c>AuthControllerHelpers.CurrentUserId</c> does for REST) — never a
    /// client-supplied id. Idempotent, so a client can safely call it again after every reconnect
    /// alongside its existing per-game <see cref="Join"/> call.
    /// </summary>
    public Task SubscribeToUser()
    {
        var userId = Context.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return userId is null ? Task.CompletedTask : Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
    }

    /// <summary>
    /// Subscribe this connection to a game's broadcasts. Safe to call again after a reconnect.
    /// <paramref name="seat"/> ("P1"/"P2", omitted/null for a spectator) additionally records this
    /// connection as that seat's live presence and clears any disconnect timestamp tracked for it
    /// — this is the reconnect path, and it covers both a genuine reconnect and an ordinary page
    /// refresh, since both look identical to the hub. Broadcasts <c>opponentReconnected</c> to the
    /// group when that seat had actually been tracked as disconnected; otherwise (a genuine first
    /// join — most importantly the second player entering a room) broadcasts <c>opponentJoined</c>
    /// to everyone else in the group, since the seat's player profile only reaches the other
    /// clients via a fresh GET and there's no other push that would prompt one. Both are still
    /// fan-out only: the caller resyncs against REST, the source of truth.
    /// </summary>
    public async Task Join(string gameId, string? seat = null)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, gameId);

        if (seat is not ("P1" or "P2") || !Guid.TryParse(gameId, out var id))
            return;

        var player = Enum.Parse<Player>(seat);
        tracker.Track(Context.ConnectionId, id, player);

        var wasDisconnected = await games.ClearDisconnectedAsync(id, player);
        if (wasDisconnected)
            await Clients.Group(gameId).SendAsync("opponentReconnected", new { seat });
        else
            await Clients.GroupExcept(gameId, Context.ConnectionId).SendAsync("opponentJoined", new { seat });
    }

    /// <summary>Stop receiving a game's broadcasts.</summary>
    public Task Leave(string gameId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, gameId);

    /// <summary>
    /// A dropped connection — network loss or a closed tab; the two look identical here, and
    /// distinguishing them is explicitly out of scope (see plan). If this connection was tracked
    /// as a seat (<see cref="GameConnectionTracker"/>) and its game is still <c>InProgress</c>,
    /// stamps that seat's disconnect timestamp and broadcasts <c>opponentDisconnected</c>. Doesn't
    /// itself end the game or start any timer — resolving an abandonment stays pull-based via
    /// <c>POST /api/games/{id}/claim-abandonment</c>.
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (tracker.TryRemove(Context.ConnectionId, out var entry))
        {
            var disconnectedAtUtc = await games.MarkDisconnectedAsync(entry.GameId, entry.Seat);
            if (disconnectedAtUtc is not null)
            {
                await Clients.Group(entry.GameId.ToString())
                    .SendAsync("opponentDisconnected", new { seat = entry.Seat.ToString(), disconnectedAtUtc });
            }
        }

        await base.OnDisconnectedAsync(exception);
    }
}
