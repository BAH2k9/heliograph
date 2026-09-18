using System.Text.Json;
using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Clock;
using Khet.Contracts;
using Khet.Engine.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Services;

/// <summary>Thrown for a rejected admin operation (bad category, last-admin guard, wrong game state) — the controller maps it to 400.</summary>
public sealed class AdminOperationException(string reason) : Exception(reason);

/// <summary>
/// Everything behind <c>/api/admin</c> — user administration, game/room cleanup, force-end, and the
/// dashboard counts. The controller is <c>[Authorize(Policy = "Admin")]</c>; this class assumes the
/// caller is already a vetted admin and only enforces the operation-level guards (can't delete
/// yourself, can't remove the last admin, force-end needs an in-progress game).
///
/// Registered <c>AddScoped</c> — it mutates tracked <see cref="ApplicationUser"/> / <see cref="Game"/>
/// rows on the request <see cref="KhetDbContext"/> and shares it with <see cref="GameEndService"/>.
/// The DI-lifetime guard test asserts this stays Scoped.
///
/// Not-found is signalled by a <c>null</c> / <c>false</c> return (the <see cref="GameService"/>
/// convention); rejected operations throw <see cref="AdminOperationException"/> /
/// <see cref="AuthValidationException"/> / <see cref="EmailAlreadyRegisteredException"/>.
/// </summary>
public sealed class AdminService(KhetDbContext db, UserManager<ApplicationUser> userManager, TimeProvider time, GameEndService gameEnd)
{
    private const int DefaultPageSize = 25;
    private const int MaxPageSize = 100;

    private DateTime Now() => time.GetUtcNow().UtcDateTime;

    // ---- users -------------------------------------------------------------------------------

    public async Task<AdminUserListResponse> ListUsersAsync(string? search, int page, int pageSize, CancellationToken ct = default)
    {
        (page, pageSize) = NormalizePaging(page, pageSize);
        var now = Now();

        var query = db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(u => EF.Functions.ILike(u.Email!, term) || EF.Functions.ILike(u.DisplayName, term));
        }

        var total = await query.CountAsync(ct);
        var users = await query
            .OrderByDescending(u => u.CreatedAtUtc).ThenBy(u => u.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);

        var sessions = await ActiveSessionCountsAsync(users.Select(u => u.Id).ToList(), now, ct);
        var rows = users.Select(u => ToRow(u, sessions.GetValueOrDefault(u.Id))).ToList();
        return new AdminUserListResponse(rows, total, page, pageSize);
    }

    public async Task<AdminUserRow?> GetUserAsync(Guid id, CancellationToken ct = default)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null)
            return null;
        var sessions = await ActiveSessionCountsAsync([id], Now(), ct);
        return ToRow(user, sessions.GetValueOrDefault(id));
    }

    /// <summary>Same validation as <c>AuthService.RegisterAsync</c>. 409 on a duplicate email, 400 otherwise.</summary>
    public async Task<AdminUserRow> CreateUserAsync(AdminCreateUserRequest request, CancellationToken ct = default)
    {
        var email = request.Email.Trim();
        var displayName = request.DisplayName.Trim();
        if (displayName.Length is 0 or > 32)
            throw new AuthValidationException("display name must be 1-32 characters");

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            DisplayName = displayName,
            CreatedAtUtc = Now(),
            IsAdmin = request.IsAdmin,
        };

        // Retry only guards the astronomically unlikely (DisplayName, Discriminator) collision —
        // same shape as RoomService.NewCode()'s join-code retry / AuthService.RegisterAsync.
        for (var attempt = 1; ; attempt++)
        {
            user.Discriminator = DiscriminatorAssigner.NewCandidate();
            try
            {
                var result = await userManager.CreateAsync(user, request.Password);
                if (!result.Succeeded)
                {
                    if (result.Errors.Any(e => e.Code is "DuplicateEmail" or "DuplicateUserName"))
                        throw new EmailAlreadyRegisteredException(email);
                    throw new AuthValidationException(string.Join("; ", result.Errors.Select(e => e.Description)));
                }
                break;
            }
            catch (DbUpdateException) when (attempt < DiscriminatorAssigner.MaxAttempts)
            {
                db.Entry(user).State = EntityState.Detached;
            }
        }

        return ToRow(user, activeSessionCount: 0);
    }

    /// <summary>False if no such user. Refuses to delete the acting admin or the last remaining admin.</summary>
    public async Task<bool> DeleteUserAsync(Guid id, Guid actingAdminId, CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null)
            return false;
        if (user.Id == actingAdminId)
            throw new AdminOperationException("you can't delete your own account");
        await GuardLastAdminAsync(user, ct);

        var result = await userManager.DeleteAsync(user);
        if (!result.Succeeded)
            throw new AdminOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
        return true;
    }

    /// <summary>
    /// Overwrites the password. The new password is run through the configured
    /// <see cref="UserManager{TUser}.PasswordValidators"/> <em>before</em> the old one is removed,
    /// so a rejected weak password (400) never leaves the account with no password —
    /// <c>RemovePassword</c> + <c>AddPassword</c> isn't atomic. Kept off Identity's reset-token path
    /// deliberately: that pulls in <c>AddDefaultTokenProviders</c> and a Data Protection key-ring
    /// dependency this project has no need for otherwise (JWT-only, no SignInManager). On success
    /// the target's live sessions are revoked. Null if no such user.
    /// </summary>
    public async Task<bool?> SetPasswordAsync(Guid id, string newPassword, CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null)
            return null;

        foreach (var validator in userManager.PasswordValidators)
        {
            var check = await validator.ValidateAsync(userManager, user, newPassword);
            if (!check.Succeeded)
                throw new AuthValidationException(string.Join("; ", check.Errors.Select(e => e.Description)));
        }

        var remove = await userManager.RemovePasswordAsync(user);
        if (!remove.Succeeded)
            throw new AdminOperationException(string.Join("; ", remove.Errors.Select(e => e.Description)));
        var add = await userManager.AddPasswordAsync(user, newPassword);
        if (!add.Succeeded)
            throw new AuthValidationException(string.Join("; ", add.Errors.Select(e => e.Description)));

        await RevokeUserTokensAsync(id, Now(), ct);
        return true;
    }

    /// <summary>
    /// Partial update of display name / admin / disabled. Refuses to clear the acting admin's own
    /// admin flag, to clear the last admin's, or to disable the acting admin. Disabling an account
    /// or removing its admin also revokes its live sessions. Null if no such user.
    /// </summary>
    public async Task<AdminUserRow?> PatchUserAsync(Guid id, Guid actingAdminId, AdminPatchUserRequest request, CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null)
            return null;

        if (request.DisplayName is { } displayName)
        {
            var trimmed = displayName.Trim();
            if (trimmed.Length is 0 or > 32)
                throw new AuthValidationException("display name must be 1-32 characters");
            user.DisplayName = trimmed;
        }

        var removingAdmin = false;
        if (request.IsAdmin is { } wantAdmin && wantAdmin != user.IsAdmin)
        {
            // Never let an admin change their own admin flag through this endpoint — in either
            // direction. Blocking only demotion would leave a hole: a just-demoted admin whose
            // access token is still inside its ~15-min lifetime could re-grant themselves here,
            // turning the accepted staleness window into permanent privilege recovery.
            if (user.Id == actingAdminId)
                throw new AdminOperationException("you can't change your own admin access");
            if (!wantAdmin)
            {
                await GuardLastAdminAsync(user, ct);
                removingAdmin = true;
            }
            user.IsAdmin = wantAdmin;
        }

        if (request.IsDisabled is { } wantDisabled && wantDisabled != user.IsDisabled)
        {
            if (wantDisabled && user.Id == actingAdminId)
                throw new AdminOperationException("you can't disable your own account");
            user.IsDisabled = wantDisabled;
        }

        await db.SaveChangesAsync(ct);

        var now = Now();
        var revokeSessions = request.IsDisabled == true || removingAdmin;
        if (revokeSessions)
            await RevokeUserTokensAsync(id, now, ct);

        var sessions = revokeSessions ? 0 : (await ActiveSessionCountsAsync([id], now, ct)).GetValueOrDefault(id);
        return ToRow(user, sessions);
    }

    /// <summary>Revokes every live refresh token for the user. Null if no such user; otherwise the count revoked.</summary>
    public async Task<int?> RevokeSessionsAsync(Guid id, CancellationToken ct = default)
    {
        if (!await db.Users.AnyAsync(u => u.Id == id, ct))
            return null;
        return await RevokeUserTokensAsync(id, Now(), ct);
    }

    /// <summary>Overwrites one rating bucket. <paramref name="request"/>.GamesPlayed omitted → keep the current count. Null if no such user.</summary>
    public async Task<AdminUserRow?> SetRatingAsync(Guid id, AdminSetRatingRequest request, CancellationToken ct = default)
    {
        if (!Enum.TryParse<TimeControlCategory>(request.Category, ignoreCase: true, out var category) || !Enum.IsDefined(category))
            throw new AdminOperationException($"unknown time-control category '{request.Category}'");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user is null)
            return null;

        var (_, currentGames) = user.BucketFor(category);
        user.SetBucket(category, request.Rating, request.GamesPlayed ?? currentGames);
        await db.SaveChangesAsync(ct);

        var sessions = await ActiveSessionCountsAsync([id], Now(), ct);
        return ToRow(user, sessions.GetValueOrDefault(id));
    }

    // ---- games / rooms ---------------------------------------------------------------------

    public async Task<AdminGameListResponse> ListGamesAsync(
        string? status, bool? rated, bool? rooms, int page, int pageSize, CancellationToken ct = default)
    {
        (page, pageSize) = NormalizePaging(page, pageSize);

        var query = db.Games.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Enum.TryParse<GameStatus>(status, ignoreCase: true, out var parsed) || !Enum.IsDefined(parsed))
                throw new AdminOperationException($"unknown game status '{status}'");
            query = query.Where(g => g.Status == parsed);
        }
        if (rated is { } r)
            query = query.Where(g => g.Rated == r);
        if (rooms is { } wantRooms)
            query = wantRooms ? query.Where(g => g.JoinCode != null) : query.Where(g => g.JoinCode == null);

        var total = await query.CountAsync(ct);
        var rows = await query
            .OrderByDescending(g => g.CreatedAtUtc).ThenBy(g => g.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(g => new
            {
                g.Id, g.Status, g.EndReason, g.Ruleset, g.Layout, g.TimeControl, g.Rated,
                g.MoveCount, g.SeatsTaken, g.JoinCode, g.P1UserId, g.P2UserId, g.CreatedAtUtc, g.FinishedAtUtc,
            })
            .ToListAsync(ct);

        var userIds = rows.SelectMany(g => new[] { g.P1UserId, g.P2UserId })
            .Where(x => x is not null).Select(x => x!.Value).Distinct().ToList();
        var names = await db.Users.AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);

        string? NameOf(Guid? uid) => uid is { } id && names.TryGetValue(id, out var n) ? n : null;

        var games = rows.Select(g => new AdminGameRow(
            g.Id, g.Status.ToString(), g.EndReason, g.Ruleset, g.Layout, g.TimeControl, g.Rated,
            g.MoveCount, g.SeatsTaken, g.JoinCode,
            g.P1UserId, NameOf(g.P1UserId), g.P2UserId, NameOf(g.P2UserId),
            g.CreatedAtUtc, g.FinishedAtUtc)).ToList();

        return new AdminGameListResponse(games, total, page, pageSize);
    }

    /// <summary>Deletes the game; its <see cref="Move"/> rows cascade. False if no such game.</summary>
    public async Task<bool> DeleteGameAsync(Guid id, CancellationToken ct = default)
    {
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return false;
        db.Games.Remove(game);
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>
    /// Force-ends an in-progress game with <paramref name="winner"/> ("P1"/"P2") as the winner and
    /// <c>EndReason = "Aborted"</c>. Deliberately does not touch Elo (owner decision). Null if no
    /// such game; <see cref="AdminOperationException"/> on a bad winner or a game that isn't
    /// in progress. The returned <see cref="GameEndedResponse"/> is what the controller broadcasts.
    /// </summary>
    public async Task<GameEndedResponse?> ForceEndAsync(Guid id, string winner, CancellationToken ct = default)
    {
        if (!Enum.TryParse<Player>(winner, ignoreCase: true, out var winnerSeat) || winnerSeat is not (Player.P1 or Player.P2))
            throw new AdminOperationException($"winner must be \"P1\" or \"P2\", got \"{winner}\"");

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return null;
        if (game.Status != GameStatus.InProgress)
            throw new AdminOperationException("game is not in progress");

        var now = Now();
        gameEnd.FinishByAdmin(game, winnerSeat, now);
        await db.SaveChangesAsync(ct);

        return new GameEndedResponse(game.Status.ToString(), game.EndReason!, now);
    }

    /// <summary>
    /// Deletes every <c>InProgress</c> room (non-null <see cref="Game.JoinCode"/>) with fewer than
    /// two seats taken and a <see cref="Game.CreatedAtUtc"/> older than
    /// <paramref name="olderThanHours"/>. Returns how many were removed.
    /// </summary>
    public async Task<int> CleanupStaleRoomsAsync(int olderThanHours, CancellationToken ct = default)
    {
        if (olderThanHours < 0)
            throw new AdminOperationException("olderThanHours must be >= 0");

        var cutoff = Now().AddHours(-olderThanHours);
        var stale = await db.Games
            .Where(g => g.Status == GameStatus.InProgress && g.JoinCode != null && g.SeatsTaken < 2 && g.CreatedAtUtc < cutoff)
            .ToListAsync(ct);
        if (stale.Count == 0)
            return 0;

        db.Games.RemoveRange(stale);
        await db.SaveChangesAsync(ct);
        return stale.Count;
    }

    public async Task<AdminStats> GetStatsAsync(CancellationToken ct = default) => new(
        TotalUsers: await db.Users.CountAsync(ct),
        AdminCount: await db.Users.CountAsync(u => u.IsAdmin, ct),
        DisabledCount: await db.Users.CountAsync(u => u.IsDisabled, ct),
        GamesInProgress: await db.Games.CountAsync(g => g.Status == GameStatus.InProgress, ct),
        GamesFinished: await db.Games.CountAsync(g => g.Status != GameStatus.InProgress, ct),
        OpenRooms: await db.Games.CountAsync(g => g.Status == GameStatus.InProgress && g.JoinCode != null && g.SeatsTaken < 2, ct),
        RatedGames: await db.Games.CountAsync(g => g.Rated, ct));

    // ---- bug reports ---------------------------------------------------------------------------

    /// <summary>
    /// Lists bug reports as summaries (no <c>Bundle</c>), newest first — same
    /// <c>NormalizePaging</c>/<c>AsNoTracking</c> idiom as <see cref="ListGamesAsync"/>.
    /// <paramref name="gameId"/>, when given, narrows to reports filed against that one game.
    /// </summary>
    public async Task<AdminBugReportListResponse> ListBugReportsAsync(Guid? gameId, int page, int pageSize, CancellationToken ct = default)
    {
        (page, pageSize) = NormalizePaging(page, pageSize);

        var query = db.BugReports.AsNoTracking();
        if (gameId is { } id)
            query = query.Where(r => r.GameId == id);

        var total = await query.CountAsync(ct);
        var rows = await query
            .OrderByDescending(r => r.ReceivedAtUtc).ThenBy(r => r.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(r => new { r.Id, r.GameId, r.UserId, r.Seat, r.MoveCount, r.ClientCapturedAtUtc, r.ReceivedAtUtc })
            .ToListAsync(ct);

        var userIds = rows.Where(r => r.UserId is not null).Select(r => r.UserId!.Value).Distinct().ToList();
        var names = await db.Users.AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);

        string? NameOf(Guid? uid) => uid is { } uidValue && names.TryGetValue(uidValue, out var n) ? n : null;

        var reports = rows.Select(r => new AdminBugReportRow(
            r.Id, r.GameId, r.UserId, NameOf(r.UserId), r.Seat, r.MoveCount, r.ClientCapturedAtUtc, r.ReceivedAtUtc)).ToList();

        return new AdminBugReportListResponse(reports, total, page, pageSize);
    }

    /// <summary>Every field of one report, including the raw <c>Bundle</c>. Null if no such report.</summary>
    public async Task<AdminBugReportDetail?> GetBugReportAsync(Guid id, CancellationToken ct = default)
    {
        var report = await db.BugReports.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (report is null)
            return null;

        string? displayName = null;
        if (report.UserId is { } userId)
            displayName = await db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.DisplayName).FirstOrDefaultAsync(ct);

        return new AdminBugReportDetail(
            report.Id, report.GameId, report.UserId, displayName, report.Seat, report.MoveCount,
            report.ClientCapturedAtUtc, report.ReceivedAtUtc,
            report.ConnectionId, report.Turn, report.Status, report.ServerOffsetMs, report.LastTraceId,
            // Deserialize::<JsonElement> (not JsonDocument.Parse(...).RootElement) — this clones
            // into a self-contained element, so nothing here depends on a JsonDocument staying
            // alive/disposed to keep the backing buffer valid.
            JsonSerializer.Deserialize<JsonElement>(report.BundleJson));
    }

    /// <summary>Deletes one bug report. False if no such report.</summary>
    public async Task<bool> DeleteBugReportAsync(Guid id, CancellationToken ct = default)
    {
        var report = await db.BugReports.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (report is null)
            return false;
        db.BugReports.Remove(report);
        await db.SaveChangesAsync(ct);
        return true;
    }

    // ---- helpers ---------------------------------------------------------------------------

    private async Task GuardLastAdminAsync(ApplicationUser user, CancellationToken ct)
    {
        if (user.IsAdmin && await db.Users.CountAsync(u => u.IsAdmin, ct) <= 1)
            throw new AdminOperationException("can't remove the last admin");
    }

    private Task<int> RevokeUserTokensAsync(Guid userId, DateTime now, CancellationToken ct) =>
        db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAtUtc == null && t.ExpiresAtUtc > now)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, now), ct);

    private Task<Dictionary<Guid, int>> ActiveSessionCountsAsync(IReadOnlyCollection<Guid> userIds, DateTime now, CancellationToken ct) =>
        db.RefreshTokens.AsNoTracking()
            .Where(t => userIds.Contains(t.UserId) && t.RevokedAtUtc == null && t.ExpiresAtUtc > now)
            .GroupBy(t => t.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, ct);

    private static AdminUserRow ToRow(ApplicationUser user, int activeSessionCount) => new(
        user.Id,
        user.Email!,
        user.DisplayName,
        user.IsAdmin,
        user.IsDisabled,
        user.CreatedAtUtc,
        RatingBucketMapper.RatingBucketsFor(user),
        activeSessionCount);

    private static (int Page, int PageSize) NormalizePaging(int page, int pageSize) =>
        (Math.Max(page, 1), pageSize <= 0 ? DefaultPageSize : Math.Min(pageSize, MaxPageSize));
}
