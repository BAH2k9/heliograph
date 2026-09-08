using Khet.Api.Contracts;
using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Clock;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Services;

// Response mapping: the one game↔accounts coupling that isn't Elo. Joins db.Users to build
// PlayerSummary. No transaction, mutates nothing — changes on a different axis from the rules
// (a profile field, an avatar rule), so it sits in its own file.
public sealed partial class GameService
{
    /// <summary>
    /// Builds the wire response, including a join to <see cref="ApplicationUser"/> for whichever
    /// seats have an account attached (<see cref="Game.P1UserId"/>/<see cref="Game.P2UserId"/>) —
    /// skipped entirely (no query at all) when neither seat is claimed, which is every plain
    /// <c>POST /api/games</c> local-play response.
    /// </summary>
    private async Task<GameResponse> ToResponseAsync(Game game, DateTime now, CancellationToken ct)
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
            game.EndReason, p1Profile, p2Profile);
    }

    /// <summary>
    /// Projects a claimed seat's account into the wire-facing <see cref="PlayerSummary"/>.
    /// <see cref="PlayerSummary.Rating"/> is the bucket matching <paramref name="timeControl"/>'s
    /// category, or <c>0</c> for an untimed game (null <paramref name="timeControl"/>) — no bucket
    /// applies, matching <see cref="ApplyEloAsync"/>'s own untimed rule; deliberately <c>0</c> rather
    /// than omitted so the client never has to distinguish the two cases.
    /// </summary>
    private static PlayerSummary ToPlayerSummary(ApplicationUser user, string? timeControl)
    {
        var rating = timeControl is null ? 0 : user.BucketFor(TimeControls.For(timeControl).Category).Rating;
        return new PlayerSummary(user.DisplayName, user.AvatarId, rating);
    }
}
