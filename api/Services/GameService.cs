using Khet.Api.Contracts;
using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Api.Mapping;
using Khet.Engine;
using Microsoft.EntityFrameworkCore;
using static Khet.Api.Services.GameHelpers;

namespace Khet.Api.Services;

// Split across per-cluster partial files (GameService.*.cs) so a task touching one concern reads
// ~one file, not the whole class. This part holds the spine: primary ctor, Now(), and the read
// side. Collaborators: GameHelpers (pure helpers), GameClockLifecycle (clock lifecycle),
// GameEndService (ending core + Elo), GameResponseMapper (the GameResponse wire shape). The
// compiler still sees one sealed class — behaviour is identical to the pre-split single file.
public sealed partial class GameService(
    KhetDbContext db,
    TimeProvider time,
    GameClockLifecycle clock,
    GameEndService endService,
    GameResponseMapper mapper)
{
    public async Task<GameResponse> CreateAsync(CreateGameRequest? request, CancellationToken ct = default)
    {
        var (ruleset, layout) = Resolve(request?.Ruleset, request?.Layout);
        var firstPlayer = ResolveFirstPlayer(request?.FirstPlayer);
        var now = Now();
        var game = NewGame(ruleset, layout, now, firstPlayer);
        db.Games.Add(game);
        await db.SaveChangesAsync(ct);
        return await mapper.ToResponseAsync(game, now, ct);
    }

    private DateTime Now() => time.GetUtcNow().UtcDateTime;

    public async Task<GameResponse?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var game = await db.Games.AsNoTracking().FirstOrDefaultAsync(g => g.Id == id, ct);
        return game is null ? null : await mapper.ToResponseAsync(game, Now(), ct);
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
}
