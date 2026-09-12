using Khet.Api.Hubs;
using Khet.Api.Services;
using Khet.Clock;
using Khet.Contracts;
using Khet.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace Khet.Api.Controllers;

/// <summary>
/// "Challenge a friend to a match" — see <c>plans/07-friend-invites-matches.md</c>. Every action is
/// <c>[Authorize]</c>: an invite only ever exists between two accounts (a friendship is required to
/// send one), never a guest. See <see cref="InviteService"/> for the business rules (random P1/P2,
/// the claim-pattern expiry re-check, …).
///
/// <see cref="Create"/> is the one action that also touches <see cref="GameHub"/> directly — after
/// <see cref="InviteService.SendAsync"/> has already persisted the invite, it broadcasts
/// <c>inviteReceived</c> to the invitee's own <c>user:{id}</c> group (see that hub's doc comment for
/// why this is a deliberate, reviewed first for a non-game-scoped group, not a quiet expansion of
/// its scoping model). Same "hub only fans out what a controller already decided" shape
/// <see cref="GamesController"/> already uses for <c>moveApplied</c>/<c>gameEnded</c> — the hub
/// method itself never runs game/invite logic.
/// </summary>
[Authorize]
[ApiController]
[Route("api/invites")]
public class InvitesController(InviteService invites, IHubContext<GameHub> hub, ILogger<InvitesController> logger) : ControllerBase
{
    /// <summary>
    /// Sends a match invite. 400 if <c>inviteeUserId</c> isn't an accepted friend of the caller, or
    /// an unknown ruleset/layout/time-control name. 201 → <see cref="MatchInviteResponse"/>; also
    /// pushes <c>inviteReceived</c> (<c>{ inviteId }</c>) to the invitee over the hub.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<MatchInviteResponse>> Create(MatchInviteCreateRequest request, CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        try
        {
            var response = await invites.SendAsync(callerId.Value, request, ct);
            logger.LogInformation("Create: pushing inviteReceived to group user:{InviteeUserId} for invite {InviteId}", request.InviteeUserId, response.Id);
            await hub.Clients.Group($"user:{request.InviteeUserId}")
                .SendAsync("inviteReceived", new { inviteId = response.Id }, ct);
            return StatusCode(StatusCodes.Status201Created, response);
        }
        catch (NotFriendsException ex)
        {
            return BadRequest(new MoveError(ex.Message));
        }
        catch (Exception ex) when (ex is UnknownRuleSetException or UnknownBoardLayoutException or UnknownTimeControlException)
        {
            return BadRequest(new MoveError(ex.Message));
        }
    }

    /// <summary>
    /// Accepts a pending invite addressed to the caller: creates the game, seats both players, and
    /// returns the same <see cref="RoomResponse"/> shape <c>POST /api/rooms/{code}/join</c> does, so
    /// the frontend can reuse its existing "you're in this room now" handling. 404 if the invite
    /// doesn't exist or is no longer pending, 403 if the caller isn't its invitee, 410 if it expired
    /// (re-checked here, per the claim pattern). Also pushes <c>inviteAccepted</c> (the inviter's own
    /// <see cref="RoomResponse"/>-shaped payload — <c>{ gameId, code, seat }</c>) to the inviter's
    /// <c>user:{id}</c> group, so the inviter's still-open "waiting for them to accept" screen can
    /// enter the room the same way <c>PendingInvitesTray</c>'s own accept flow does — without this,
    /// the inviter was never told the invite had been accepted at all.
    /// </summary>
    [HttpPost("{id:guid}/accept")]
    public async Task<ActionResult<RoomResponse>> Accept(Guid id, CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        try
        {
            var (response, inviterId, inviterSeat) = await invites.AcceptAsync(callerId.Value, id, ct);
            logger.LogInformation(
                "Accept: pushing inviteAccepted to group user:{InviterId} for invite {InviteId} -> game {GameId} seat {Seat}",
                inviterId, id, response.GameId, inviterSeat);
            await hub.Clients.Group($"user:{inviterId}")
                .SendAsync("inviteAccepted", new { gameId = response.GameId, code = response.Code, seat = inviterSeat }, ct);
            return Ok(response);
        }
        catch (UnknownInviteException ex)
        {
            return NotFound(new MoveError(ex.Message));
        }
        catch (NotYourInviteException)
        {
            return Forbid();
        }
        catch (InviteExpiredException ex)
        {
            return StatusCode(StatusCodes.Status410Gone, new MoveError(ex.Message));
        }
    }

    /// <summary>Declines a pending invite addressed to the caller. Same auth-error shape as <see cref="Accept"/> (minus 410). 204 on success.</summary>
    [HttpPost("{id:guid}/decline")]
    public async Task<IActionResult> Decline(Guid id, CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        try
        {
            await invites.DeclineAsync(callerId.Value, id, ct);
            return NoContent();
        }
        catch (UnknownInviteException ex)
        {
            return NotFound(new MoveError(ex.Message));
        }
        catch (NotYourInviteException)
        {
            return Forbid();
        }
    }

    /// <summary>
    /// Pending invites where the caller is the invitee — the fallback list a client's toast handler
    /// re-fetches from on an <c>inviteReceived</c> push, and what a reconnecting client catches up
    /// against. Never trust the push payload alone as content, same discipline as every other hub
    /// event in this app.
    /// </summary>
    [HttpGet("pending")]
    public async Task<ActionResult<IReadOnlyList<PendingMatchInvite>>> Pending(CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        return Ok(await invites.ListPendingAsync(callerId.Value, ct));
    }

    /// <summary>
    /// REST fallback for the caller's own not-yet-consumed sent invites (pending or already
    /// accepted) — see <see cref="SentMatchInvite"/>'s doc comment for why this exists: the
    /// <c>inviteAccepted</c> hub push has no replay, so the "waiting for them to accept" screen
    /// polls this to recover from a missed push (dropped connection, a reload since sending, …).
    /// </summary>
    [HttpGet("sent")]
    public async Task<ActionResult<IReadOnlyList<SentMatchInvite>>> Sent(CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        return Ok(await invites.ListSentAsync(callerId.Value, ct));
    }
}
