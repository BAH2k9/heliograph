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

    public async Task<GameResponse> CreateAsync(CancellationToken ct = default)
    {
        var game = new Game
        {
            Id = Guid.NewGuid(),
            CreatedAtUtc = DateTime.UtcNow,
            Status = GameStatus.InProgress,
            CurrentTurn = Player.P1,
            MoveCount = 0,
            RulesVersion = RulesVersion,
            State = BoardMapper.ToState(GameEngine.CreateStartingBoard()),
        };

        db.Games.Add(game);
        await db.SaveChangesAsync(ct);

        return ToResponse(game);
    }

    public async Task<GameResponse?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var game = await db.Games.AsNoTracking().FirstOrDefaultAsync(g => g.Id == id, ct);
        return game is null ? null : ToResponse(game);
    }

    public async Task<SubmitMoveResult> SubmitMoveAsync(Guid id, SubmitMoveRequest request, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (game is null)
            return SubmitMoveResult.NotFound();
        if (game.Status != GameStatus.InProgress)
            return SubmitMoveResult.Finished();

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

        var validation = GameEngine.ValidateMove(board, move, game.CurrentTurn);
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
            CreatedAtUtc = DateTime.UtcNow,
        });

        game.State = BoardMapper.ToState(afterLaser);
        game.MoveCount += 1;
        game.Status = status;
        game.CurrentTurn = status == GameStatus.InProgress ? Other(mover) : mover;

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

    private static GameResponse ToResponse(Game game) =>
        new(game.Id, game.Status.ToString(), game.CurrentTurn.ToString(), game.MoveCount, game.State);
}
