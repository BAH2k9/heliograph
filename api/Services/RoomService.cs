using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Clock;
using Khet.Contracts;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using static Khet.Api.Services.GameHelpers;

namespace Khet.Api.Services;

/// <summary>
/// Rooms / seating — create a room, join it by code, propose/accept a rematch that reuses the room.
/// Split out of <see cref="GameService"/> because it shares nothing with the move flow but the pure
/// <c>GameHelpers</c> statics and <see cref="GameClockLifecycle"/>: <see cref="JoinRoomAsync"/> owns
/// its own transaction (clock-init + the <see cref="Game.Rated"/> flip, no Elo), and
/// <see cref="CreateRoomAsync"/> has neither. <see cref="RequestRematchAsync"/>/
/// <see cref="DeclineRematchAsync"/> are the "add a rematch endpoint that reuses the room" task this
/// comment used to just anticipate.
///
/// Registered <c>AddScoped</c>. <see cref="RoomsController"/> injects this instead of
/// <see cref="GameService"/>; <see cref="Controllers.GamesController"/> injects it alongside
/// <see cref="GameService"/> for the rematch actions.
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
    /// other way.
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

    /// <summary>
    /// "I want a rematch" — no separate accept step; each seat's own call is both its request and,
    /// when the other seat has already called this too, its consent. First caller just gets
    /// recorded (<see cref="Game.P1RematchRequestedAtUtc"/>/<see cref="Game.P2RematchRequestedAtUtc"/>,
    /// mirroring <see cref="Game.P1RemainingMs"/>/<see cref="Game.P2RemainingMs"/>'s additive-column
    /// shape) and gets back <c>Matched: false</c>; the second caller finds the first seat's request
    /// already stamped and creates the rematch room right then, via the same
    /// <see cref="CreateGameWithCodeAsync"/> both <see cref="CreateRoomAsync"/> and
    /// <c>InviteService.AcceptAsync</c> use — seats swap (old P2 → new P1, old P1 → new P2, the same
    /// "who lands in which parameter" trick <c>InviteService.AcceptAsync</c> uses for its random
    /// first-mover, just deterministic here — owner decision, chess.com-style color swap) and
    /// <see cref="Game.Ruleset"/>/<see cref="Game.Layout"/>/<see cref="Game.TimeControl"/>/
    /// <see cref="Game.Rated"/> carry over unchanged from the finished game, never re-inferred.
    /// <see cref="GameClockLifecycle.InitializeClock"/> is called explicitly afterward — unlike
    /// <see cref="JoinRoomAsync"/>'s "second seat fills" path, <see cref="CreateGameWithCodeAsync"/>
    /// itself never starts the clock, and this path fills both seats at creation just like
    /// <c>InviteService.AcceptAsync</c> does (itself a no-op for an untimed rematch, since
    /// <see cref="GameClockLifecycle.InitializeClock"/> already short-circuits on a null
    /// <see cref="Game.TimeControl"/>).
    /// <para>
    /// Re-requesting after <see cref="Game.RematchGameId"/> is already set is idempotent: it just
    /// returns that same room, never creates a second one — this is also the recovery path for a
    /// client that missed the <c>rematchReady</c> hub push (it also always shows up on the next
    /// plain <c>GET /api/games/{id}</c>, since <see cref="Game.RematchGameId"/> is on
    /// <see cref="GameResponse"/>).
    /// </para>
    /// <para>
    /// The decisive stamp is written with <c>ExecuteUpdateAsync</c> rather than the usual
    /// tracked-entity <c>SaveChangesAsync</c>, and specifically inside this method's own
    /// transaction: Postgres holds that row's write lock for the rest of the transaction (not just
    /// the statement), so a second, truly-concurrent request for the other seat blocks here until
    /// the first commits, then re-reads the now-current row rather than racing off a stale
    /// snapshot. Without that ordering, two callers who both arrive before either commits could each
    /// see the other seat's column as still-null and both return "pending" — the exact "both players
    /// clicked at once" case this method exists to get right — or, worse, each try to create their
    /// own rematch room. This is why the stamp isn't just an ordinary <c>SaveChangesAsync</c> like
    /// every other write in this class.
    /// </para>
    /// Throws <see cref="RematchException"/>: 400 for an unknown <paramref name="seat"/> or a
    /// non-room game, 409 (<c>Conflict</c>) if the game is still <c>InProgress</c>. Returns null if
    /// no game has this id.
    /// </summary>
    public async Task<RematchOutcome?> RequestRematchAsync(Guid gameId, string seat, DateTime now, CancellationToken ct = default)
    {
        if (seat is not ("P1" or "P2"))
            throw new RematchException($"unknown seat '{seat}'");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var rowsUpdated = seat == "P1"
            ? await db.Games.Where(g => g.Id == gameId)
                .ExecuteUpdateAsync(s => s.SetProperty(g => g.P1RematchRequestedAtUtc, now), ct)
            : await db.Games.Where(g => g.Id == gameId)
                .ExecuteUpdateAsync(s => s.SetProperty(g => g.P2RematchRequestedAtUtc, now), ct);
        if (rowsUpdated == 0)
        {
            await transaction.RollbackAsync(ct);
            return null;
        }

        var game = await db.Games.FirstAsync(g => g.Id == gameId, ct);

        if (game.JoinCode is null)
            throw new RematchException("not a room game");
        if (game.Status == GameStatus.InProgress)
            throw new RematchException("game is still in progress", conflict: true);

        var mySeat = seat == "P1" ? "P2" : "P1";

        if (game.RematchGameId is Guid existingId)
        {
            var existing = await db.Games.AsNoTracking().FirstAsync(g => g.Id == existingId, ct);
            await transaction.CommitAsync(ct);
            return new RematchOutcome(true, new RoomResponse(existing.Id, existing.JoinCode!, mySeat));
        }

        var otherRequestedAt = seat == "P1" ? game.P2RematchRequestedAtUtc : game.P1RematchRequestedAtUtc;
        if (otherRequestedAt is null)
        {
            await transaction.CommitAsync(ct);
            return new RematchOutcome(false, null);
        }

        // Always old-P2-becomes-P1 / old-P1-becomes-P2 — fixed regardless of which seat happens to
        // be the one whose request completes the match, unlike `mySeat` above (which is about this
        // *caller's* own new seat, not the swap direction itself).
        var (p1UserId, p2UserId) = (game.P2UserId, game.P1UserId);
        var newGame = await CreateGameWithCodeAsync(
            game.Ruleset, game.Layout, game.TimeControl, game.Rated, p1UserId, p2UserId, seatsTaken: 2, ct);
        clock.InitializeClock(newGame, now);
        await db.SaveChangesAsync(ct);

        game.RematchGameId = newGame.Id;
        await db.SaveChangesAsync(ct);

        await transaction.CommitAsync(ct);
        return new RematchOutcome(true, new RoomResponse(newGame.Id, newGame.JoinCode!, mySeat));
    }

    /// <summary>
    /// Withdraws a rematch request: clears both seats' <see cref="Game.P1RematchRequestedAtUtc"/>/
    /// <see cref="Game.P2RematchRequestedAtUtc"/> back to null so a later
    /// <see cref="RequestRematchAsync"/> call starts clean, rather than a decline from one seat
    /// leaving the other seat's still-stamped request around to be silently "matched" by some
    /// unrelated later click. No-op (still 204-worthy) if neither side had requested anything.
    /// Never touches <see cref="Game.RematchGameId"/> — declining only makes sense before a match
    /// happened; once it has, there's nothing left to decline. Same 400/404 shape as
    /// <see cref="RequestRematchAsync"/> (unknown seat / no such game); does not itself check
    /// <see cref="Game.Status"/>, since declining a request against an already-finished-either-way
    /// game is harmless.
    /// </summary>
    public async Task<bool> DeclineRematchAsync(Guid gameId, string seat, CancellationToken ct = default)
    {
        if (seat is not ("P1" or "P2"))
            throw new RematchException($"unknown seat '{seat}'");

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == gameId, ct);
        if (game is null)
            return false;

        game.P1RematchRequestedAtUtc = null;
        game.P2RematchRequestedAtUtc = null;
        await db.SaveChangesAsync(ct);
        return true;
    }
}

/// <summary>
/// Result of <see cref="RoomService.RequestRematchAsync"/>. <see cref="Matched"/> is false while
/// waiting on the other seat (<see cref="Room"/> is then null) — true once both seats have
/// requested, with <see cref="Room"/> carrying the caller's own <c>RoomResponse</c>-shaped seat in
/// the new room (already seat-swapped).
/// </summary>
public sealed record RematchOutcome(bool Matched, RoomResponse? Room);
