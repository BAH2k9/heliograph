using Khet.Api.Contracts;
using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Api.Mapping;
using Khet.Clock;
using Khet.Engine;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Services;

public sealed class GameService(KhetDbContext db, TimeProvider time)
{
    private const int RulesVersion = 1;

    /// <summary>
    /// How long the *other* seat's connection must have been tracked as disconnected before
    /// <see cref="ClaimAbandonmentAsync"/> will accept a claim against it. A tunable constant, not
    /// a product negotiation (owner decision, plans/02-disconnect-abandonment.md).
    /// </summary>
    private const int AbandonmentGraceSeconds = 45;

    // No 0/O/1/I/L — a code gets read aloud and typed by hand.
    private const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private const int CodeLength = 6;

    public async Task<GameResponse> CreateAsync(CreateGameRequest? request, CancellationToken ct = default)
    {
        var (ruleset, layout) = Resolve(request?.Ruleset, request?.Layout);
        var firstPlayer = ResolveFirstPlayer(request?.FirstPlayer);
        var now = Now();
        var game = NewGame(ruleset, layout, now, firstPlayer);
        db.Games.Add(game);
        await db.SaveChangesAsync(ct);
        return await ToResponseAsync(game, now, ct);
    }

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

        // Retry only guards the astronomically unlikely code collision (unique index).
        for (var attempt = 1; ; attempt++)
        {
            var game = NewGame(ruleset, layout, Now());
            game.JoinCode = NewCode();
            game.SeatsTaken = 1;
            game.P1UserId = callerId;
            game.TimeControl = timeControl;
            db.Games.Add(game);
            try
            {
                await db.SaveChangesAsync(ct);
                return new RoomResponse(game.Id, game.JoinCode, Player.P1.ToString());
            }
            catch (DbUpdateException) when (attempt < 5)
            {
                db.Entry(game).State = EntityState.Detached;
            }
        }
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
            InitializeClock(game);
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

    private static Game NewGame(string ruleset, string layout, DateTime now, Player firstPlayer = Player.P1) => new()
    {
        Id = Guid.NewGuid(),
        CreatedAtUtc = now,
        Status = GameStatus.InProgress,
        CurrentTurn = firstPlayer,
        MoveCount = 0,
        RulesVersion = RulesVersion,
        Ruleset = ruleset,
        Layout = layout,
        State = BoardMapper.ToState(BoardLayouts.For(layout).Build()),
    };

    private DateTime Now() => time.GetUtcNow().UtcDateTime;

    /// <summary>
    /// Normalises and validates the requested ruleset/layout names. Null/blank → <c>"Classic"</c>;
    /// the returned names are the registry's canonical casing. Throws
    /// <see cref="UnknownRuleSetException"/> / <see cref="UnknownBoardLayoutException"/> (→ 400) on an unknown name.
    /// </summary>
    private static (string Ruleset, string Layout) Resolve(string? ruleset, string? layout) =>
        (RuleSets.For(string.IsNullOrWhiteSpace(ruleset) ? "Classic" : ruleset.Trim()).Name,
         BoardLayouts.For(string.IsNullOrWhiteSpace(layout) ? "Classic" : layout.Trim()).Name);

    /// <summary>Null/blank → untimed (null). Throws <see cref="UnknownTimeControlException"/> (→ 400) on an unknown name.</summary>
    private static string? ResolveTimeControl(string? timeControl) =>
        string.IsNullOrWhiteSpace(timeControl) ? null : TimeControls.For(timeControl.Trim()).Name;

    /// <summary>
    /// Starts the clock the instant both seats are filled (see <see cref="JoinRoomAsync"/>'s doc
    /// comment for why not at room creation). No-op for an untimed room (<see cref="Game.TimeControl"/>
    /// null). Room games always start with P1 to move (<see cref="NewGame"/>'s default), so the
    /// live-category deadline is P1's own bank; Daily has no bank at all — see
    /// <see cref="ClockMath.NextDailyDeadline"/>.
    /// </summary>
    private void InitializeClock(Game game)
    {
        if (game.TimeControl is null)
            return;

        var control = TimeControls.For(game.TimeControl);
        var now = Now();
        game.TurnStartedAtUtc = now;

        if (control.Category == TimeControlCategory.Daily)
        {
            game.TurnDeadlineUtc = ClockMath.NextDailyDeadline(control, now);
            return;
        }

        var initialMs = control.InitialSeconds * 1000L;
        game.P1RemainingMs = initialMs;
        game.P2RemainingMs = initialMs;
        game.TurnDeadlineUtc = now.AddMilliseconds(initialMs);
    }

    /// <summary>Null/blank → P1. Throws <see cref="MoveRequestException"/> (→ 400) on an unknown name.</summary>
    private static Player ResolveFirstPlayer(string? firstPlayer) =>
        string.IsNullOrWhiteSpace(firstPlayer)
            ? Player.P1
            : Enum.TryParse<Player>(firstPlayer.Trim(), ignoreCase: true, out var parsed)
                ? parsed
                : throw new MoveRequestException($"unknown player '{firstPlayer}'");

    private static string NewCode() =>
        string.Create(CodeLength, 0, static (span, _) =>
        {
            for (var i = 0; i < span.Length; i++)
                span[i] = CodeAlphabet[Random.Shared.Next(CodeAlphabet.Length)];
        });

    public async Task<GameResponse?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var game = await db.Games.AsNoTracking().FirstOrDefaultAsync(g => g.Id == id, ct);
        return game is null ? null : await ToResponseAsync(game, Now(), ct);
    }

    /// <summary>
    /// Lightweight summaries for an archive/list view, newest first. No board state.
    /// <paramref name="mine"/>, when set, filters to games where that account holds either seat
    /// (via the normal room flow or a later <see cref="ClaimSeatAsync"/>) — the controller only
    /// passes it once the caller is known to be authenticated.
    /// </summary>
    public async Task<List<GameSummary>> ListGamesAsync(Guid? mine = null, CancellationToken ct = default)
    {
        var query = db.Games.AsNoTracking();
        if (mine is { } userId)
            query = query.Where(g => g.P1UserId == userId || g.P2UserId == userId);

        // Project the raw columns in SQL (skips the jsonb State/Moves) and convert the enum to
        // its wire string in memory — .ToString() on a converted enum doesn't reliably translate.
        var rows = await query
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new { g.Id, g.CreatedAtUtc, g.FinishedAtUtc, g.Status, g.Ruleset, g.Layout, g.MoveCount, g.Rated, g.EndReason })
            .ToListAsync(ct);

        return rows
            .Select(g => new GameSummary(g.Id, g.CreatedAtUtc, g.FinishedAtUtc, g.Status.ToString(), g.Ruleset, g.Layout, g.MoveCount, g.Rated, g.EndReason))
            .ToList();
    }

    /// <summary>
    /// Returns the game's starting board plus its full move history in <c>MoveNumber</c> order,
    /// or null if no game has this id (an existing game with no moves yet returns an empty
    /// <see cref="MoveHistoryResponse.Moves"/>, not null).
    /// </summary>
    public async Task<MoveHistoryResponse?> GetMoveHistoryAsync(Guid id, CancellationToken ct = default)
    {
        var game = await db.Games.AsNoTracking()
            .Select(g => new { g.Id, g.Layout })
            .FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return null;

        var moves = await db.Moves
            .AsNoTracking()
            .Where(m => m.GameId == id)
            .OrderBy(m => m.MoveNumber)
            .ToListAsync(ct);

        // No per-move board is persisted (see Move's doc comment) — replay from the starting
        // layout through the real, pure engine so each item's board can't drift from the rules.
        var board = BoardLayouts.For(game.Layout).Build();
        var startingBoardState = BoardMapper.ToState(board);
        var items = new List<MoveHistoryItem>(moves.Count);
        foreach (var move in moves)
        {
            var afterMove = GameEngine.ApplyMove(board, BoardMapper.ToEngineMove(move));
            (board, _) = GameEngine.FireLaser(afterMove, move.Player);
            items.Add(ToHistoryItem(move, BoardMapper.ToState(board)));
        }

        return new MoveHistoryResponse(startingBoardState, items);
    }

    private static MoveHistoryItem ToHistoryItem(Move move, BoardState boardState) => new(
        move.MoveNumber,
        move.Player.ToString(),
        move.Type.ToString(),
        new CoordDto(move.FromRow, move.FromCol),
        move.ToRow is int row && move.ToCol is int col ? new CoordDto(row, col) : null,
        move.RotationDir?.ToString(),
        move.LaserResult,
        boardState,
        move.CreatedAtUtc);

    public async Task<SubmitMoveResult> SubmitMoveAsync(Guid id, SubmitMoveRequest request, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return SubmitMoveResult.NotFound();
        if (game.Status != GameStatus.InProgress)
            return SubmitMoveResult.Finished();

        // Captured once, up front — every clock decision this call makes (the expiry check right
        // below, the post-move AfterMove/NextDailyDeadline update, and the response's ServerNowUtc)
        // reads this same instant, never a fresh DateTime.UtcNow/time.GetUtcNow() per line.
        var now = Now();

        // The mover may already have run out of time before this move ever arrived (slow to
        // submit, or they raced a claim-timeout and lost) — checked before validating the move at
        // all, so an expired mover can never sneak a move in. Mirrors ClaimTimeoutAsync's check;
        // both funnel into FinishByTimeoutAsync so a timeout resolves identically either way.
        if (ClockMath.HasExpired(game.TurnDeadlineUtc, now))
        {
            await FinishByTimeoutAsync(game, game.CurrentTurn, now, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return SubmitMoveResult.TimedOut(new GameEndedResponse(game.Status.ToString(), game.EndReason!, now));
        }

        // Room games enforce the seat when the caller supplies one; direct /api/games play
        // (no JoinCode) and callers that omit Seat are unaffected.
        if (game.JoinCode is not null && request.Seat is { Length: > 0 } seat)
        {
            if (seat is not ("P1" or "P2"))
                return SubmitMoveResult.Illegal("spectators cannot move");
            if (seat != game.CurrentTurn.ToString())
                return SubmitMoveResult.Illegal("not your turn");
        }

        EngineMove move;
        try
        {
            move = BoardMapper.ToEngineMove(request);
        }
        catch (MoveRequestException ex)
        {
            return SubmitMoveResult.Illegal(ex.Message);
        }

        var board = BoardMapper.ToBoard(game.State);
        var rules = RuleSets.For(game.Ruleset);

        var validation = GameEngine.ValidateMove(board, move, game.CurrentTurn, rules);
        if (!validation.IsLegal)
            return SubmitMoveResult.Illegal(validation.Reason!);

        var mover = game.CurrentTurn;
        var afterMove = GameEngine.ApplyMove(board, move);
        var (afterLaser, outcome) = GameEngine.FireLaser(afterMove, mover);
        var status = GameEngine.CheckWin(afterLaser);
        var laserResult = BoardMapper.ToLaserResult(outcome, mover, afterMove);

        // Add to the DbSet (not game.Moves) so EF tracks it as Added — a client-set Guid key
        // discovered only via the navigation collection is otherwise treated as Modified.
        db.Moves.Add(new Move
        {
            Id = Guid.NewGuid(),
            GameId = game.Id,
            MoveNumber = game.MoveCount + 1,
            Player = mover,
            Type = move.Kind,
            FromRow = move.From.Row,
            FromCol = move.From.Col,
            ToRow = move.To?.Row,
            ToCol = move.To?.Col,
            RotationDir = move.Rotation,
            LaserResult = laserResult,
            CreatedAtUtc = now,
        });

        game.State = BoardMapper.ToState(afterLaser);
        game.MoveCount += 1;
        game.Status = status;
        if (status != GameStatus.InProgress)
        {
            game.FinishedAtUtc = now;
            game.EndReason = "Pharaoh";
        }
        else
        {
            // The game continues — bank the mover's clock (or reset Daily's deadline) for the
            // turn that just started. Skipped entirely for an untimed game, and for a timed room
            // whose clock never actually started (TimeControl set but P2 hasn't joined yet — see
            // InitializeClock's doc comment) rather than guessing a start time that never happened.
            if (game.TimeControl is not null && game.TurnStartedAtUtc is { } turnStartedAtUtc)
                UpdateClockAfterMove(game, mover, turnStartedAtUtc, now);
        }
        game.CurrentTurn = status == GameStatus.InProgress ? Other(mover) : mover;

        // Rated is only ever true when both seats were already authenticated at the moment they
        // were filled (see JoinRoomAsync) — which implies both UserIds are non-null here too.
        if (status != GameStatus.InProgress && game.Rated)
            await ApplyEloAsync(game, status, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        var response = new SubmitMoveResponse(
            game.State,
            laserResult.Segments,
            laserResult.Eliminated,
            laserResult.Damaged,
            game.Status.ToString(),
            game.CurrentTurn.ToString(),
            game.MoveCount,
            game.TimeControl,
            game.P1RemainingMs,
            game.P2RemainingMs,
            game.TurnStartedAtUtc,
            game.TurnDeadlineUtc,
            now);

        return SubmitMoveResult.Ok(response);
    }

    private static Player Other(Player player) => player == Player.P1 ? Player.P2 : Player.P1;

    /// <summary>
    /// Authoritatively resolves a claimed timeout against the server's own clock — never trusts
    /// the caller's own notion of "it's expired". Same one-mechanism-for-everything shape as
    /// <see cref="SubmitMoveAsync"/>'s pre-validation check: both funnel into
    /// <see cref="FinishByTimeoutAsync"/> so a timeout resolves identically whether it's caught by
    /// a submitted move or by this endpoint. Throws <see cref="ClaimTimeoutException"/> (→ 409) if
    /// the game isn't in progress, or if <see cref="Game.TurnDeadlineUtc"/> genuinely hasn't passed
    /// yet (including an untimed game, where it's always null). Null if no game has this id.
    /// </summary>
    public async Task<ClaimTimeoutResponse?> ClaimTimeoutAsync(Guid id, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return null;

        if (game.Status != GameStatus.InProgress)
            throw new ClaimTimeoutException("game is already finished");

        var now = Now();
        if (!ClockMath.HasExpired(game.TurnDeadlineUtc, now))
        {
            // Covers both "genuinely not expired yet" and "this game has no deadline at all"
            // (untimed, or a timed room whose clock hasn't started — TurnDeadlineUtc null either
            // way) — HasExpired treats null the same as not-yet-expired, so one message covers both.
            throw new ClaimTimeoutException(
                game.TurnDeadlineUtc is null ? "this game has no clock to time out" : "not yet expired");
        }

        await FinishByTimeoutAsync(game, game.CurrentTurn, now, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return new ClaimTimeoutResponse(game.Id, game.Status.ToString(), game.EndReason!, now);
    }

    /// <summary>
    /// Clears <paramref name="seat"/>'s tracked disconnect timestamp — called by
    /// <see cref="Hubs.GameHub.Join"/> on every reconnect (which looks identical to an ordinary
    /// page-refresh rejoin, and that's fine). Returns whether that seat actually had a disconnect
    /// tracked, so the hub only broadcasts <c>opponentReconnected</c> when there was something to
    /// reconnect *from* — not on every ordinary first join. False (no-op) if no game has this id.
    /// </summary>
    public async Task<bool> ClearDisconnectedAsync(Guid id, Player seat, CancellationToken ct = default)
    {
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return false;

        var wasDisconnected = DisconnectedAt(game, seat) is not null;
        SetDisconnectedAt(game, seat, null);
        await db.SaveChangesAsync(ct);
        return wasDisconnected;
    }

    /// <summary>
    /// Stamps <paramref name="seat"/>'s disconnect timestamp to now — called by
    /// <see cref="Hubs.GameHub.OnDisconnectedAsync"/> when a tracked connection drops. Only while
    /// the game is still <c>InProgress</c> (nothing worth tracking once it's already finished);
    /// returns null (no-op) otherwise, or if no game has this id, so the hub knows not to
    /// broadcast <c>opponentDisconnected</c>.
    /// </summary>
    public async Task<DateTime?> MarkDisconnectedAsync(Guid id, Player seat, CancellationToken ct = default)
    {
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null || game.Status != GameStatus.InProgress)
            return null;

        var now = Now();
        SetDisconnectedAt(game, seat, now);
        await db.SaveChangesAsync(ct);
        return now;
    }

    private static DateTime? DisconnectedAt(Game game, Player seat) =>
        seat == Player.P1 ? game.P1DisconnectedAtUtc : game.P2DisconnectedAtUtc;

    private static void SetDisconnectedAt(Game game, Player seat, DateTime? value)
    {
        if (seat == Player.P1)
            game.P1DisconnectedAtUtc = value;
        else
            game.P2DisconnectedAtUtc = value;
    }

    /// <summary>
    /// Authoritatively resolves a claimed abandonment against the *other* seat's server-tracked
    /// disconnect timestamp — never trusts the caller's own say-so, same shape as
    /// <see cref="ClaimTimeoutAsync"/>. <paramref name="seat"/> is the caller's own seat ("my
    /// opponent abandoned, I win"). Applies to every game regardless of time control — untimed and
    /// Daily rooms are the actual motivating case, since they have no other resolution path (see
    /// plan's "Owner decisions already made"). Throws <see cref="ClaimAbandonmentException"/>
    /// (→ 409) if the game has already finished, if the other seat has no disconnect tracked at
    /// all, or if it's tracked but hasn't been <see cref="AbandonmentGraceSeconds"/> yet. Null if
    /// no game has this id.
    /// </summary>
    public async Task<ClaimAbandonmentResponse?> ClaimAbandonmentAsync(Guid id, string seat, CancellationToken ct = default)
    {
        if (seat is not ("P1" or "P2"))
            throw new ClaimAbandonmentException($"unknown seat '{seat}'");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return null;

        if (game.Status != GameStatus.InProgress)
            throw new ClaimAbandonmentException("game is already finished");

        var callerSeat = seat == "P1" ? Player.P1 : Player.P2;
        var opponentSeat = Other(callerSeat);
        var opponentDisconnectedAt = DisconnectedAt(game, opponentSeat);

        if (opponentDisconnectedAt is null)
            throw new ClaimAbandonmentException("opponent is not disconnected");

        var now = Now();
        if ((now - opponentDisconnectedAt.Value).TotalSeconds < AbandonmentGraceSeconds)
            throw new ClaimAbandonmentException("opponent has not been disconnected long enough");

        await FinishGameAsync(game, winner: callerSeat, "Abandonment", now, ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return new ClaimAbandonmentResponse(game.Id, game.Status.ToString(), game.EndReason!, now);
    }

    /// <summary>
    /// Applied after an accepted move on a game whose clock has actually started (see
    /// <see cref="SubmitMoveAsync"/>'s call site). Daily just resets its deadline —
    /// <see cref="ClockMath.NextDailyDeadline"/>; a live category banks <paramref name="mover"/>'s
    /// remaining time and sets the next turn's start/deadline off the *other* player's own bank,
    /// which this move never touches — <see cref="ClockMath.AfterMove"/>.
    /// </summary>
    private void UpdateClockAfterMove(Game game, Player mover, DateTime turnStartedAtUtc, DateTime now)
    {
        var control = TimeControls.For(game.TimeControl!);

        if (control.Category == TimeControlCategory.Daily)
        {
            game.TurnStartedAtUtc = now;
            game.TurnDeadlineUtc = ClockMath.NextDailyDeadline(control, now);
            return;
        }

        var moverRemainingMs = mover == Player.P1 ? game.P1RemainingMs : game.P2RemainingMs;
        var opponentRemainingMs = mover == Player.P1 ? game.P2RemainingMs : game.P1RemainingMs;
        var result = ClockMath.AfterMove(control, moverRemainingMs ?? 0, opponentRemainingMs ?? 0, turnStartedAtUtc, now);

        if (mover == Player.P1)
            game.P1RemainingMs = result.MoverRemainingMs;
        else
            game.P2RemainingMs = result.MoverRemainingMs;
        game.TurnStartedAtUtc = result.NextTurnStartedAtUtc;
        game.TurnDeadlineUtc = result.NextTurnDeadlineUtc;
    }

    /// <summary>
    /// Shared by <see cref="SubmitMoveAsync"/>'s pre-validation check and
    /// <see cref="ClaimTimeoutAsync"/>: ends the game exactly like an ordinary decisive win —
    /// reusing <see cref="GameStatus"/>'s existing <c>P1Win</c>/<c>P2Win</c> values and the same
    /// <see cref="ApplyEloAsync"/> trigger point — except <see cref="Game.EndReason"/> is
    /// <c>"Timeout"</c> rather than <c>"Pharaoh"</c>, and the mover who ran out is the loser.
    /// Does not save or commit — the caller owns its own transaction.
    /// </summary>
    private async Task FinishByTimeoutAsync(Game game, Player timedOutPlayer, DateTime now, CancellationToken ct) =>
        await FinishGameAsync(game, winner: Other(timedOutPlayer), "Timeout", now, ct);

    /// <summary>
    /// Shared by <see cref="ResignAsync"/>: same shape as <see cref="FinishByTimeoutAsync"/> —
    /// <paramref name="resigningPlayer"/> is the loser, the other seat wins, <see cref="Game.EndReason"/>
    /// is <c>"Resignation"</c>. Does not save or commit — the caller owns its own transaction.
    /// </summary>
    private async Task FinishByResignationAsync(Game game, Player resigningPlayer, DateTime now, CancellationToken ct) =>
        await FinishGameAsync(game, winner: Other(resigningPlayer), "Resignation", now, ct);

    /// <summary>
    /// Common tail behind both <see cref="FinishByTimeoutAsync"/> and
    /// <see cref="FinishByResignationAsync"/>: sets the win/<see cref="Game.EndReason"/>/
    /// <see cref="Game.FinishedAtUtc"/> fields and, when <see cref="Game.Rated"/>, applies Elo via
    /// the same <see cref="ApplyEloAsync"/> path every other decisive ending uses. Does not save or
    /// commit — the caller owns its own transaction.
    /// </summary>
    private async Task FinishGameAsync(Game game, Player winner, string endReason, DateTime now, CancellationToken ct)
    {
        var winnerStatus = winner == Player.P1 ? GameStatus.P1Win : GameStatus.P2Win;
        game.Status = winnerStatus;
        game.EndReason = endReason;
        game.FinishedAtUtc = now;

        if (game.Rated)
            await ApplyEloAsync(game, winnerStatus, ct);
    }

    /// <summary>
    /// Ends the game by resignation — <paramref name="seat"/> concedes, so the *other* seat wins.
    /// Same transaction shape as <see cref="ClaimTimeoutAsync"/>. Throws <see cref="ResignException"/>
    /// (→ 400) if <paramref name="seat"/> isn't "P1"/"P2" — a spectator has no seat to resign, and
    /// it's the only way the server knows who's conceding — or (→ 409, <see cref="ResignException.Conflict"/>)
    /// if the game isn't <see cref="GameStatus.InProgress"/>. Null if no game has this id.
    /// </summary>
    public async Task<ResignResponse?> ResignAsync(Guid id, string? seat, CancellationToken ct = default)
    {
        if (seat is not ("P1" or "P2"))
            throw new ResignException("spectators cannot resign");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return null;

        if (game.Status != GameStatus.InProgress)
            throw new ResignException("game is already finished", conflict: true);

        var now = Now();
        var resigningPlayer = Enum.Parse<Player>(seat);
        await FinishByResignationAsync(game, resigningPlayer, now, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return new ResignResponse(game.Id, game.Status.ToString(), game.EndReason!, now);
    }

    /// <summary>
    /// Loads both accounts (tracked, same context/transaction as the move) and applies
    /// <see cref="EloService.Apply"/> to whichever rating bucket matches
    /// <see cref="Game.TimeControl"/>'s <see cref="TimeControlCategory"/>. Only called when
    /// <see cref="Game.Rated"/> is true, which guarantees both <see cref="Game.P1UserId"/>/
    /// <see cref="Game.P2UserId"/> are set.
    ///
    /// Behavior change: an untimed rated game (<see cref="Game.TimeControl"/> null) has no category
    /// to attribute a rating change to, so this is a no-op — no bucket moves. Matches chess.com,
    /// which has no rating for "no time control" either.
    /// </summary>
    private async Task ApplyEloAsync(Game game, GameStatus status, CancellationToken ct)
    {
        if (game.TimeControl is null)
            return;
        var category = TimeControls.For(game.TimeControl).Category;

        var winnerId = status == GameStatus.P1Win ? game.P1UserId!.Value : game.P2UserId!.Value;
        var loserId = status == GameStatus.P1Win ? game.P2UserId!.Value : game.P1UserId!.Value;

        var winner = await db.Users.FirstAsync(u => u.Id == winnerId, ct);
        var loser = await db.Users.FirstAsync(u => u.Id == loserId, ct);

        var (winnerRatingBefore, winnerGamesPlayed) = winner.BucketFor(category);
        var (loserRatingBefore, loserGamesPlayed) = loser.BucketFor(category);

        var (winnerRating, loserRating) = EloService.Apply(winnerRatingBefore, loserRatingBefore);
        winner.SetBucket(category, winnerRating, winnerGamesPlayed + 1);
        loser.SetBucket(category, loserRating, loserGamesPlayed + 1);
    }

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

/// <summary>
/// Thrown by <see cref="GameService.ClaimTimeoutAsync"/>: always 409 (Conflict) — either the game
/// has already finished, or <see cref="Domain.Game.TurnDeadlineUtc"/> genuinely hasn't passed yet.
/// </summary>
public sealed class ClaimTimeoutException(string reason) : Exception(reason);

/// <summary>
/// Thrown by <see cref="GameService.ClaimAbandonmentAsync"/>: always 409 (Conflict) — the game has
/// already finished, the other seat has no disconnect tracked at all, or it hasn't been tracked
/// long enough yet.
/// </summary>
public sealed class ClaimAbandonmentException(string reason) : Exception(reason);

/// <summary>Thrown by <see cref="GameService.ClaimSeatAsync"/>: 400, or 409 when <see cref="Conflict"/>.</summary>
public sealed class ClaimSeatException(string reason, bool conflict = false) : Exception(reason)
{
    public bool Conflict { get; } = conflict;
}

/// <summary>
/// Thrown by <see cref="GameService.ResignAsync"/>: 400 (a spectator/missing seat has nothing to
/// resign) unless <see cref="Conflict"/> is set, in which case it's 409 (the game already finished).
/// </summary>
public sealed class ResignException(string reason, bool conflict = false) : Exception(reason)
{
    public bool Conflict { get; } = conflict;
}
