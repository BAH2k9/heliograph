using Heliograph.Api.Hubs;
using Heliograph.Api.Services;
using Heliograph.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace Heliograph.Api.Controllers;

/// <summary>
/// The friend request/accept/decline/unfriend/list surface. Every action is <c>[Authorize]</c> —
/// friendship only exists between accounts, never guests. See <see cref="FriendService"/> for the
/// business rules (implicit accept, idempotent unfriend, …).
///
/// <see cref="CreateRequest"/> also pushes <c>friendRequestReceived</c> to the addressee's own
/// <c>user:{id}</c> group — same "hub only fans out what a controller already decided" shape as
/// <see cref="InvitesController.Create"/>'s <c>inviteReceived</c> push, and the same minimal
/// (content-free) payload discipline: the client always re-fetches
/// <c>GET /api/friends/requests/incoming</c> rather than trusting the push itself.
/// </summary>
[Authorize]
[ApiController]
[Route("api/friends")]
public class FriendsController(FriendService friends, IHubContext<GameHub> hub) : ControllerBase
{
    /// <summary>
    /// Sends a friend request. 400 if <c>addresseeId</c> doesn't exist or is the caller's own id,
    /// 409 if already friends or a request is already pending in the same direction. If the reverse
    /// direction was already pending, this call accepts it instead — 200 <c>{ "status": "accepted" }</c>
    /// — otherwise 201 <c>{ "status": "pending" }</c>; also pushes <c>friendRequestReceived</c> to the
    /// addressee over the hub in the pending case (the implicit-accept case has no "pending request"
    /// for anyone to be notified about).
    /// </summary>
    [HttpPost("requests")]
    public async Task<ActionResult<FriendRequestCreateResponse>> CreateRequest(FriendRequestCreate request, CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        try
        {
            var result = await friends.RequestAsync(callerId.Value, request.AddresseeId, ct);
            if (result.Status == "pending")
            {
                await hub.Clients.Group($"user:{request.AddresseeId}")
                    .SendAsync("friendRequestReceived", new { }, ct);
            }
            return result.Status == "accepted" ? Ok(result) : StatusCode(StatusCodes.Status201Created, result);
        }
        catch (UnknownUserException ex)
        {
            return BadRequest(new MoveError(ex.Message));
        }
        catch (AlreadyFriendsException ex)
        {
            return Conflict(new MoveError(ex.Message));
        }
    }

    /// <summary>Accepts a pending request addressed to the caller. 404 if no such pending request. 200 → the new <see cref="FriendSummary"/>.</summary>
    [HttpPost("requests/{id:guid}/accept")]
    public async Task<ActionResult<FriendSummary>> Accept(Guid id, CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        try
        {
            return Ok(await friends.AcceptAsync(callerId.Value, id, ct));
        }
        catch (FriendRequestNotFoundException ex)
        {
            return NotFound(new MoveError(ex.Message));
        }
    }

    /// <summary>Declines (deletes) a pending request addressed to the caller. 404 if no such pending request, else 204.</summary>
    [HttpPost("requests/{id:guid}/decline")]
    public async Task<IActionResult> Decline(Guid id, CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        try
        {
            await friends.DeclineAsync(callerId.Value, id, ct);
            return NoContent();
        }
        catch (FriendRequestNotFoundException ex)
        {
            return NotFound(new MoveError(ex.Message));
        }
    }

    /// <summary>Removes an accepted friendship in either direction. Always 204 — idempotent, whether or not one existed.</summary>
    [HttpDelete("{friendUserId:guid}")]
    public async Task<IActionResult> Unfriend(Guid friendUserId, CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        await friends.UnfriendAsync(callerId.Value, friendUserId, ct);
        return NoContent();
    }

    /// <summary>The caller's accepted friendships.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<FriendSummary>>> List(CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        return Ok(await friends.ListFriendsAsync(callerId.Value, ct));
    }

    /// <summary>Pending requests where the caller is the addressee (someone asked them).</summary>
    [HttpGet("requests/incoming")]
    public async Task<ActionResult<IReadOnlyList<FriendRequestSummary>>> Incoming(CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        return Ok(await friends.ListIncomingAsync(callerId.Value, ct));
    }

    /// <summary>Pending requests where the caller is the requester (they asked someone).</summary>
    [HttpGet("requests/outgoing")]
    public async Task<ActionResult<IReadOnlyList<FriendRequestSummary>>> Outgoing(CancellationToken ct)
    {
        var callerId = this.CurrentUserId();
        if (callerId is null)
            return Unauthorized();

        return Ok(await friends.ListOutgoingAsync(callerId.Value, ct));
    }
}
