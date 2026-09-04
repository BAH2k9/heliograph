using Microsoft.AspNetCore.SignalR;

namespace Khet.Api.Hubs;

/// <summary>
/// Fans move results out to everyone watching a game. Mapped at <c>/api/hub</c> (under
/// <c>/api/*</c>, so Caddy already routes it). The REST <c>POST /api/games/{id}/moves</c> stays
/// the source of truth — this hub only broadcasts the <see cref="Contracts.SubmitMoveResponse"/>
/// that endpoint produced, to the group named by the game id.
/// </summary>
public sealed class GameHub : Hub
{
    /// <summary>Subscribe this connection to a game's broadcasts. Safe to call again after a reconnect.</summary>
    public Task Join(string gameId) => Groups.AddToGroupAsync(Context.ConnectionId, gameId);

    /// <summary>Stop receiving a game's broadcasts.</summary>
    public Task Leave(string gameId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, gameId);
}
