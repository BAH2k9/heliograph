using Khet.Api.Contracts;
using Khet.Api.Domain.Enums;
using Khet.Api.Engine;
using Khet.Api.Mapping;

namespace Khet.Api.Tests.Persistence;

public class BoardMapperTests
{
    [Fact]
    public void Board_to_state_and_back_is_lossless()
    {
        var original = GameEngine.CreateStartingBoard();

        var round = BoardMapper.ToBoard(BoardMapper.ToState(original));

        Assert.Equal(original.Rows, round.Rows);
        Assert.Equal(original.Cols, round.Cols);
        Assert.Equal(original.Pieces.Count, round.Pieces.Count);
        foreach (var (coord, piece) in original.Pieces)
        {
            Assert.True(round.TryGet(coord, out var actual));
            Assert.Equal(piece, actual);
        }
    }

    [Fact]
    public void To_engine_move_reads_a_shift()
    {
        var request = new SubmitMoveRequest("move", new CoordDto(2, 3), new CoordDto(2, 4), null);

        var move = BoardMapper.ToEngineMove(request);

        Assert.Equal(MoveKind.Move, move.Kind);
        Assert.Equal(new Coord(2, 3), move.From);
        Assert.Equal(new Coord(2, 4), move.To);
    }

    [Theory]
    [InlineData("CW", RotationDir.CW)]
    [InlineData("ccw", RotationDir.CCW)]
    public void To_engine_move_reads_a_rotation_case_insensitively(string rotation, RotationDir expected)
    {
        var request = new SubmitMoveRequest("rotate", new CoordDto(7, 2), null, rotation);

        var move = BoardMapper.ToEngineMove(request);

        Assert.Equal(MoveKind.Rotate, move.Kind);
        Assert.Equal(expected, move.Rotation);
    }

    [Theory]
    [InlineData("move", "'to' is required for a move")]
    [InlineData("rotate", "'rotation' is required for a rotate")]
    [InlineData("teleport", "'type' must be 'move' or 'rotate'")]
    public void To_engine_move_rejects_a_malformed_request(string type, string expectedMessage)
    {
        var request = new SubmitMoveRequest(type, new CoordDto(0, 0), null, null);

        var ex = Assert.Throws<MoveRequestException>(() => BoardMapper.ToEngineMove(request));
        Assert.Equal(expectedMessage, ex.Message);
    }

    [Fact]
    public void To_laser_result_describes_each_eliminated_piece_from_the_pre_laser_board()
    {
        var pharaohAt = new Coord(4, 9);
        var board = Board.Create(GameEngine.Rows, GameEngine.Cols, new Dictionary<Coord, PieceOnBoard>
        {
            [pharaohAt] = new(Piece.Pharaoh, Player.P2, null, null),
        });
        var (_, outcome) = GameEngine.FireLaser(board, Player.P1);

        var result = BoardMapper.ToLaserResult(outcome, Player.P1, board);

        var kill = Assert.Single(result.Eliminated);
        Assert.Equal((4, 9), (kill.Row, kill.Col));
        Assert.Equal("Pharaoh", kill.Kind);
        Assert.Equal("P2", kill.Owner);
        Assert.Equal("HitPharaoh", result.Termination);
        Assert.Equal(new CoordDto(4, 9), result.HitCell);
    }
}
