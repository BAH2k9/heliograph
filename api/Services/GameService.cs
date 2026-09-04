using Khet.Api.Contracts;
using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Api.Domain.Enums;
using Khet.Api.Engine;
using Khet.Api.Mapping;
using Microsoft.EntityFrameworkCore;

namespace Khet.Api.Services;

public sealed class GameService(KhetDbContext db)
{
    private const int RulesVersion = 1;

    // No 0/O/1/I/L — a code gets read aloud and typed by hand.
    private const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private const int CodeLength = 6;

    public async Task<GameResponse> CreateAsync(CreateGameRequest? request, CancellationToken ct = default)
    {
        var (ruleset, layout) = Resolve(request?.Ruleset, request?.Layout);
        var firstPlayer = ResolveFirstPlayer(request?.FirstPlayer);
        var game = NewGame(ruleset, layout, firstPlayer);
        db.Games.Add(game);
        await db.SaveChangesAsync(ct);
        return ToResponse(game);
    }

    /// <summary>
    /// Creates a room: a fresh game plus a shareable code, with the caller seated as P1.
    /// <paramref name="callerId"/> is the authenticated caller's id, or null for a guest — either
    /// way the room works identically; an authenticated creator just gets <see cref="Game.P1UserId"/> set.
    /// </summary>
    public async Task<RoomResponse> CreateRoomAsync(CreateRoomRequest? request, Guid? callerId, CancellationToken ct = default)
    {
        // Validate the ruleset/layout once, before the retry loop and before any DB work.
        var (ruleset, layout) = Resolve(request?.Ruleset, request?.Layout);

        // Retry only guards the astronomically unlikely code collision (unique index).
        for (var attempt = 1; ; attempt++)
        {
            var game = NewGame(ruleset, layout);
            game.JoinCode = NewCode();
            game.SeatsTaken = 1;
            game.P1UserId = callerId;
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

    private static Game NewGame(string ruleset, string layout, Player firstPlayer = Player.P1) => new()
    {
        Id = Guid.NewGuid(),
        CreatedAtUtc = DateTime.UtcNow,
        Status = GameStatus.InProgress,
        CurrentTurn = firstPlayer,
        MoveCount = 0,
        RulesVersion = RulesVersion,
        Ruleset = ruleset,
        Layout = layout,
        State = BoardMapper.ToState(BoardLayouts.For(layout).Build()),
    };

    /// <summary>
    /// Normalises and validates the requested ruleset/layout names. Null/blank → <c>"Classic"</c>;
    /// the returned names are the registry's canonical casing. Throws
    /// <see cref="UnknownRuleSetException"/> / <see cref="UnknownBoardLayoutException"/> (→ 400) on an unknown name.
    /// </summary>
    private static (string Ruleset, string Layout) Resolve(string? ruleset, string? layout) =>
        (RuleSets.For(string.IsNullOrWhiteSpace(ruleset) ? "Classic" : ruleset.Trim()).Name,
         BoardLayouts.For(string.IsNullOrWhiteSpace(layout) ? "Classic" : layout.Trim()).Name);

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
        return game is null ? null : ToResponse(game);
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
            .Select(g => new { g.Id, g.CreatedAtUtc, g.FinishedAtUtc, g.Status, g.Ruleset, g.Layout, g.MoveCount, g.Rated })
            .ToListAsync(ct);

        return rows
            .Select(g => new GameSummary(g.Id, g.CreatedAtUtc, g.FinishedAtUtc, g.Status.ToString(), g.Ruleset, g.Layout, g.MoveCount, g.Rated))
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
        var now = DateTime.UtcNow;

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
            game.FinishedAtUtc = now;
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
            game.MoveCount);

        return SubmitMoveResult.Ok(response);
    }

    private static Player Other(Player player) => player == Player.P1 ? Player.P2 : Player.P1;

    /// <summary>
    /// Loads both accounts (tracked, same context/transaction as the move) and applies
    /// <see cref="EloService.Apply"/>. Only called when <see cref="Game.Rated"/> is true, which
    /// guarantees both <see cref="Game.P1UserId"/>/<see cref="Game.P2UserId"/> are set.
    /// </summary>
    private async Task ApplyEloAsync(Game game, GameStatus status, CancellationToken ct)
    {
        var winnerId = status == GameStatus.P1Win ? game.P1UserId!.Value : game.P2UserId!.Value;
        var loserId = status == GameStatus.P1Win ? game.P2UserId!.Value : game.P1UserId!.Value;

        var winner = await db.Users.FirstAsync(u => u.Id == winnerId, ct);
        var loser = await db.Users.FirstAsync(u => u.Id == loserId, ct);

        var (winnerRating, loserRating) = EloService.Apply(winner.Rating, loser.Rating);
        winner.Rating = winnerRating;
        winner.RatedGamesPlayed += 1;
        loser.Rating = loserRating;
        loser.RatedGamesPlayed += 1;
    }

    private static GameResponse ToResponse(Game game) =>
        new(game.Id, game.Status.ToString(), game.CurrentTurn.ToString(), game.MoveCount, game.State,
            game.Ruleset, game.Layout, game.Rated, game.P1UserId is not null, game.P2UserId is not null);
}

/// <summary>Thrown by <see cref="GameService.ClaimSeatAsync"/>: 400, or 409 when <see cref="Conflict"/>.</summary>
public sealed class ClaimSeatException(string reason, bool conflict = false) : Exception(reason)
{
    public bool Conflict { get; } = conflict;
}
