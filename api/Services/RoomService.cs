using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Clock;
using Khet.Contracts;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using static Khet.Api.Services.GameHelpers;

namespace Khet.Api.Services;

/// <summary>
/// Rooms / seating — create a room, join it by code, attach an account to a seat after logging in.
/// Split out of <see cref="GameService"/> because it shares nothing with the move flow but the pure
/// <c>GameHelpers</c> statics and <see cref="GameClockLifecycle"/>: <see cref="JoinRoomAsync"/> owns
/// its own transaction (clock-init + the <see cref="Game.Rated"/> flip, no Elo),
/// <see cref="ClaimSeatAsync"/> is a single <c>SaveChangesAsync</c>, and <see cref="CreateRoomAsync"/>
/// has neither. A task like "add a rematch endpoint that reuses the room" lives here.
///
/// Registered <c>AddScoped</c>. <see cref="RoomsController"/> injects this instead of
/// <see cref="GameService"/>; <see cref="Controllers.GamesController"/> injects it alongside
/// <see cref="GameService"/> for the one <c>/api/games/{id}/claim-seat</c> action.
///
/// <see cref="InviteService"/> (plan <c>07-friend-invites-matches.md</c>) also injects this — its
/// accept path creates a room game exactly the way <see cref="CreateRoomAsync"/> does, just with
/// both seats filled and <see cref="Game.Rated"/> decided explicitly by the invite instead of
/// inferred. See <see cref="CreateGameWithCodeAsync"/>, the private-in-spirit (internal for
/// cross-class visibility within this assembly) helper both paths call so the ruleset/layout/time-
/// control resolution and the join-code retry-on-collision loop exist in exactly one place.
/// </summary>
public sealed class RoomService(KhetDbContext db, TimeProvider time, GameClockLifecycle clock)
{
    // No 0/O/1/I/L — a code gets read aloud and typed by hand.
    private const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private const int CodeLength = 6;

    private DateTime Now() => time.GetUtcNow().UtcDateTime;

    /// <summary>
    /// Creates a room: a fresh game plus a shareable code, with the caller seated as P1.
    /// <paramref name="callerId"/> is the authenticated caller's id, or null for a guest — either
    /// way the room works identically; an authenticated creator just gets <see cref="Game.P1UserId"/> set.
    /// </summary>
    public async Task<RoomResponse> CreateRoomAsync(CreateRoomRequest? request, Guid? callerId, CancellationToken ct = default)
    {
        // Validate the ruleset/layout/time control once, before the retry loop and before any DB work.
        var (ruleset, layout) = Resolve(request?.Ruleset, request?.Layout);
        var timeControl = ResolveTimeControl(request?.TimeControl);

        var game = await CreateGameWithCodeAsync(
            ruleset, layout, timeControl, rated: false,
            p1UserId: callerId, p2UserId: null, seatsTaken: 1, ct);
        return new RoomResponse(game.Id, game.JoinCode!, Player.P1.ToString());
    }

    /// <summary>
    /// Joins an existing room by code. The first joiner takes P2; anyone after that spectates.
    /// Returns null when no room has that code. <paramref name="callerId"/> is the authenticated
    /// joiner's id, or null for a guest. If both seats end up authenticated right here — the
    /// normal path to a rated game — <see cref="Game.Rated"/> is set true; it never flips true any
    /// other way (a later <see cref="ClaimSeatAsync"/> attaches an id without rating the game).
    /// </summary>
    public async Task<RoomResponse?> JoinRoomAsync(string code, Guid? callerId, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.JoinCode == code, ct);
        if (game is null)
            return null;

        string seat;
        if (game.SeatsTaken < 2)
        {
            game.SeatsTaken = 2;
            game.P2UserId = callerId;
            if (game.P1UserId is not null && game.P2UserId is not null)
                game.Rated = true;
            // Capture `now` right here, immediately before the clock is initialized — the same
            // instant InitializeClock read internally before it became a parameter. Hoisting it any
            // earlier (e.g. above the query) would shift TurnStartedAtUtc/TurnDeadlineUtc by the
            // transaction-open + query latency: a timing change no test would catch.
            var now = Now();
            clock.InitializeClock(game, now);
            seat = Player.P2.ToString();
            await db.SaveChangesAsync(ct);
        }
        else
        {
            seat = "Spectator";
        }

        await transaction.CommitAsync(ct);
        return new RoomResponse(game.Id, code, seat);
    }

    /// <summary>
    /// Attaches the caller's account to a seat on an existing room game — for a player who was
    /// anonymous when they created/joined and logged in afterward (mid-game or after it ended).
    /// Makes the game show up in that account's <c>mine=true</c> archive; never makes an
    /// already-unrated game rated (see <see cref="Game.Rated"/>'s doc comment). Idempotent if the
    /// caller already holds that seat. Throws <see cref="ClaimSeatException"/> (→ 400/409) on a
    /// non-room game or a seat someone else already claimed. Null if no game has this id.
    /// </summary>
    public async Task<ClaimSeatResponse?> ClaimSeatAsync(Guid id, Guid callerId, string seat, CancellationToken ct = default)
    {
        if (seat is not ("P1" or "P2"))
            throw new ClaimSeatException($"unknown seat '{seat}'");

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return null;

        if (game.JoinCode is null)
            throw new ClaimSeatException("not a room game");

        var currentHolder = seat == "P1" ? game.P1UserId : game.P2UserId;
        if (currentHolder is not null && currentHolder != callerId)
            throw new ClaimSeatException("seat already claimed", conflict: true);

        if (seat == "P1")
            game.P1UserId = callerId;
        else
            game.P2UserId = callerId;

        await db.SaveChangesAsync(ct);
        return new ClaimSeatResponse(game.Id, seat, Claimed: true);
    }

    /// <summary>
    /// Shared by <see cref="CreateRoomAsync"/> and <c>InviteService.AcceptAsync</c> — the only two
    /// places a room game is ever created. Runs the ruleset/layout/time-control values through
    /// unchanged (the caller has already resolved/validated them via <c>GameHelpers.Resolve</c>/
    /// <c>GameHelpers.ResolveTimeControl</c> — <see cref="InviteService"/> validates at invite-send
    /// time, not accept time, so a stale invite can't surface a 400 on accept for a preset that was
    /// valid when sent) and owns the one genuinely shared piece of logic: the join-code
    /// retry-on-collision loop. <c>internal</c>, not <c>private</c>, purely because
    /// <see cref="InviteService"/> is a separate class in the same assembly — it is not part of
    /// <see cref="RoomService"/>'s public API and nothing outside <c>Khet.Api</c> can see it.
    /// Always seats P1 to move first (<c>GameHelpers.NewGame</c>'s default); <see cref="InviteService"/>
    /// gets its "first move: random" behaviour by randomizing which account lands in
    /// <paramref name="p1UserId"/> vs <paramref name="p2UserId"/> before calling this, not by
    /// varying the engine's first-mover here.
    /// </summary>
    internal async Task<Game> CreateGameWithCodeAsync(
        string ruleset, string layout, string? timeControl, bool rated,
        Guid? p1UserId, Guid? p2UserId, int seatsTaken, CancellationToken ct)
    {
        // Retry only guards the astronomically unlikely code collision (unique index).
        for (var attempt = 1; ; attempt++)
        {
            var game = NewGame(ruleset, layout, Now());
            game.JoinCode = NewCode();
            game.SeatsTaken = seatsTaken;
            game.P1UserId = p1UserId;
            game.P2UserId = p2UserId;
            game.TimeControl = timeControl;
            game.Rated = rated;
            db.Games.Add(game);
            try
            {
                await db.SaveChangesAsync(ct);
                return game;
            }
            catch (DbUpdateException) when (attempt < 5)
            {
                db.Entry(game).State = EntityState.Detached;
            }
        }
    }

    private static string NewCode() =>
        string.Create(CodeLength, 0, static (span, _) =>
        {
            for (var i = 0; i < span.Length; i++)
                span[i] = CodeAlphabet[Random.Shared.Next(CodeAlphabet.Length)];
        });
}
