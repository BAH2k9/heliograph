using Khet.Api.Hubs;
using Khet.Api.Services;
using Khet.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace Khet.Api.Controllers;

/// <summary>
/// The <c>/api/admin</c> surface — user administration, game/room cleanup, force-end, dashboard
/// stats. Gated as a whole by the <c>"Admin"</c> policy (the <c>is_admin</c> access-token claim —
/// see <c>JwtTokenService</c>), so a non-admin bearer token gets 403 and no token gets 401. All the
/// real work is in <see cref="AdminService"/>; this just maps its <c>null</c>/exception results to
/// status codes and fans the one force-end result out over <see cref="GameHub"/> exactly as
/// <see cref="GamesController"/> does for a resignation.
/// </summary>
[ApiController]
[Route("api/admin")]
[Authorize(Policy = "Admin")]
public class AdminController(AdminService admin, IHubContext<GameHub> hub) : ControllerBase
{
    // ---- users ---------------------------------------------------------------------------------

    [HttpGet("users")]
    public async Task<ActionResult<AdminUserListResponse>> ListUsers(
        [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default) =>
        Ok(await admin.ListUsersAsync(search, page, pageSize, ct));

    [HttpGet("users/{id:guid}")]
    public async Task<ActionResult<AdminUserRow>> GetUser(Guid id, CancellationToken ct)
    {
        var user = await admin.GetUserAsync(id, ct);
        return user is null ? NotFound(new AdminError($"no user with id {id}")) : Ok(user);
    }

    [HttpPost("users")]
    public async Task<ActionResult<AdminUserRow>> CreateUser(AdminCreateUserRequest request, CancellationToken ct)
    {
        try
        {
            var user = await admin.CreateUserAsync(request, ct);
            return CreatedAtAction(nameof(GetUser), new { id = user.Id }, user);
        }
        catch (EmailAlreadyRegisteredException ex)
        {
            return Conflict(new AdminError(ex.Message));
        }
        catch (Exception ex) when (ex is AuthValidationException or AdminOperationException)
        {
            return BadRequest(new AdminError(ex.Message));
        }
    }

    [HttpPatch("users/{id:guid}")]
    public async Task<ActionResult<AdminUserRow>> PatchUser(Guid id, AdminPatchUserRequest request, CancellationToken ct)
    {
        var actingAdminId = this.CurrentUserId();
        if (actingAdminId is null)
            return Unauthorized();
        try
        {
            var user = await admin.PatchUserAsync(id, actingAdminId.Value, request, ct);
            return user is null ? NotFound(new AdminError($"no user with id {id}")) : Ok(user);
        }
        catch (Exception ex) when (ex is AuthValidationException or AdminOperationException)
        {
            return BadRequest(new AdminError(ex.Message));
        }
    }

    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id, CancellationToken ct)
    {
        var actingAdminId = this.CurrentUserId();
        if (actingAdminId is null)
            return Unauthorized();
        try
        {
            return await admin.DeleteUserAsync(id, actingAdminId.Value, ct)
                ? NoContent()
                : NotFound(new AdminError($"no user with id {id}"));
        }
        catch (AdminOperationException ex)
        {
            return BadRequest(new AdminError(ex.Message));
        }
    }

    [HttpPost("users/{id:guid}/password")]
    public async Task<IActionResult> SetPassword(Guid id, AdminSetPasswordRequest request, CancellationToken ct)
    {
        try
        {
            var done = await admin.SetPasswordAsync(id, request.NewPassword, ct);
            return done is null ? NotFound(new AdminError($"no user with id {id}")) : NoContent();
        }
        catch (AuthValidationException ex)
        {
            return BadRequest(new AdminError(ex.Message));
        }
    }

    [HttpPost("users/{id:guid}/revoke-sessions")]
    public async Task<ActionResult<AdminRevokeSessionsResponse>> RevokeSessions(Guid id, CancellationToken ct)
    {
        var revoked = await admin.RevokeSessionsAsync(id, ct);
        return revoked is null
            ? NotFound(new AdminError($"no user with id {id}"))
            : Ok(new AdminRevokeSessionsResponse(revoked.Value));
    }

    [HttpPost("users/{id:guid}/rating")]
    public async Task<ActionResult<AdminUserRow>> SetRating(Guid id, AdminSetRatingRequest request, CancellationToken ct)
    {
        try
        {
            var user = await admin.SetRatingAsync(id, request, ct);
            return user is null ? NotFound(new AdminError($"no user with id {id}")) : Ok(user);
        }
        catch (AdminOperationException ex)
        {
            return BadRequest(new AdminError(ex.Message));
        }
    }

    // ---- games / rooms ------------------------------------------------------------------------

    [HttpGet("games")]
    public async Task<ActionResult<AdminGameListResponse>> ListGames(
        [FromQuery] string? status, [FromQuery] bool? rated, [FromQuery] bool? rooms,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        try
        {
            return Ok(await admin.ListGamesAsync(status, rated, rooms, page, pageSize, ct));
        }
        catch (AdminOperationException ex)
        {
            return BadRequest(new AdminError(ex.Message));
        }
    }

    [HttpDelete("games/{id:guid}")]
    public async Task<IActionResult> DeleteGame(Guid id, CancellationToken ct) =>
        await admin.DeleteGameAsync(id, ct) ? NoContent() : NotFound(new AdminError($"no game with id {id}"));

    [HttpPost("games/{id:guid}/force-end")]
    public async Task<IActionResult> ForceEnd(Guid id, AdminForceEndRequest request, CancellationToken ct)
    {
        try
        {
            var ended = await admin.ForceEndAsync(id, request.Winner, ct);
            if (ended is null)
                return NotFound(new AdminError($"no game with id {id}"));

            await hub.Clients.Group(id.ToString()).SendAsync("gameEnded", ended, ct);
            return Ok(ended);
        }
        catch (AdminOperationException ex)
        {
            return BadRequest(new AdminError(ex.Message));
        }
    }

    [HttpPost("rooms/cleanup")]
    public async Task<ActionResult<AdminRoomCleanupResponse>> CleanupRooms(AdminRoomCleanupRequest request, CancellationToken ct)
    {
        try
        {
            var deleted = await admin.CleanupStaleRoomsAsync(request.OlderThanHours, ct);
            return Ok(new AdminRoomCleanupResponse(deleted));
        }
        catch (AdminOperationException ex)
        {
            return BadRequest(new AdminError(ex.Message));
        }
    }

    [HttpGet("stats")]
    public async Task<ActionResult<AdminStats>> Stats(CancellationToken ct) => Ok(await admin.GetStatsAsync(ct));

    // ---- bug reports -----------------------------------------------------------------------

    [HttpGet("bug-reports")]
    public async Task<ActionResult<AdminBugReportListResponse>> ListBugReports(
        [FromQuery] Guid? gameId, [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default) =>
        Ok(await admin.ListBugReportsAsync(gameId, page, pageSize, ct));

    [HttpGet("bug-reports/{id:guid}")]
    public async Task<ActionResult<AdminBugReportDetail>> GetBugReport(Guid id, CancellationToken ct)
    {
        var report = await admin.GetBugReportAsync(id, ct);
        return report is null ? NotFound(new AdminError($"no bug report with id {id}")) : Ok(report);
    }

    [HttpDelete("bug-reports/{id:guid}")]
    public async Task<IActionResult> DeleteBugReport(Guid id, CancellationToken ct) =>
        await admin.DeleteBugReportAsync(id, ct) ? NoContent() : NotFound(new AdminError($"no bug report with id {id}"));
}
