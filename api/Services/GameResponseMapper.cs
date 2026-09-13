using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Clock;
using Khet.Contracts;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Services;

/// <summary>
/// Builds the <see cref="GameResponse"/> wire shape — the one game↔accounts coupling that isn't
/// Elo: it joins <c>db.Users</c> to attach each claimed seat's <see cref="PlayerSummary"/> (display
/// name, avatar, category rating). Extracted from <see cref="GameService"/> so a task on the game
/// response (e.g. "spectators should see player avatars") opens this file. No transaction, mutates
/// nothing — <see cref="ToResponseAsync"/> takes the caller's already-captured <c>now</c>, so this
/// type needs no <c>TimeProvider</c>. Registered <c>AddScoped</c> alongside <see cref="GameService"/>.
/// </summary>
public sealed class GameResponseMapper(KhetDbContext db)
{
    /// <summary>
    /// Builds the wire response, including a join to <see cref="ApplicationUser"/> for whichever
    /// seats have an account attached (<see cref="Game.P1UserId"/>/<see cref="Game.P2UserId"/>) —
    /// skipped entirely (no query at all) when neither seat is claimed, which is every plain
    /// <c>POST /api/games</c> local-play response.
    /// </summary>
    public async Task<GameResponse> ToResponseAsync(Game game, DateTime now, CancellationToken ct)
    {
        PlayerSummary? p1Profile = null;
        PlayerSummary? p2Profile = null;

        if (game.P1UserId is not null || game.P2UserId is not null)
        {
            var userIds = new[] { game.P1UserId, game.P2UserId }.Where(id => id is not null).Select(id => id!.Value).ToArray();
            var users = await db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);

            if (game.P1UserId is { } p1Id && users.TryGetValue(p1Id, out var p1User))
                p1Profile = ToPlayerSummary(p1User, game.TimeControl);
            if (game.P2UserId is { } p2Id && users.TryGetValue(p2Id, out var p2User))
                p2Profile = ToPlayerSummary(p2User, game.TimeControl);
        }

        return new(game.Id, game.Status.ToString(), game.CurrentTurn.ToString(), game.MoveCount, game.State,
            game.Ruleset, game.Layout, game.Rated, game.P1UserId is not null, game.P2UserId is not null,
            game.TimeControl, game.P1RemainingMs, game.P2RemainingMs, game.TurnStartedAtUtc, game.TurnDeadlineUtc,
            now, game.Status == GameStatus.InProgress && ClockMath.HasExpired(game.TurnDeadlineUtc, now),
            game.EndReason, p1Profile, p2Profile, game.BotSeat?.ToString(), game.BotDifficulty, game.RematchGameId);
    }

    /// <summary>
    /// Projects a claimed seat's account into the wire-facing <see cref="PlayerSummary"/>.
    /// <see cref="PlayerSummary.Rating"/> is the bucket matching <paramref name="timeControl"/>'s
    /// category, or the <see cref="TimeControlCategory.Untimed"/> bucket for an untimed game (null
    /// <paramref name="timeControl"/>) — same category <see cref="GameEndService.ApplyEloAsync"/>
    /// moves for a rated untimed win. Always a real bucket value (never a sentinel), whether or not
    /// this particular game is <see cref="Game.Rated"/> — an unrated game still shows what the
    /// account's rating in that category currently is, same as a rated one.
    /// </summary>
    private static PlayerSummary ToPlayerSummary(ApplicationUser user, string? timeControl)
    {
        var category = timeControl is null ? TimeControlCategory.Untimed : TimeControls.For(timeControl).Category;
        return new PlayerSummary(user.DisplayName, user.AvatarId, user.BucketFor(category).Rating);
    }
}
