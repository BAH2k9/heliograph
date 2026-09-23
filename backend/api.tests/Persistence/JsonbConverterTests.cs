using Heliograph.Api.Mapping;
using Heliograph.Api.Persistence;
using Heliograph.Contracts;
using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Api.Tests.Persistence;

/// <summary>
/// The jsonb columns store <see cref="BoardState"/> and <see cref="LaserResult"/> as JSON
/// strings via <see cref="JsonbConverter{T}"/>. These check the round-trip the DB relies on,
/// without needing a database.
/// </summary>
public class JsonbConverterTests
{
    [Fact]
    public void BoardState_survives_a_serialize_deserialize_round_trip()
    {
        var original = BoardMapper.ToState(GameEngine.CreateStartingBoard());
        var converter = new JsonbConverter<BoardState>();

        var json = (string)converter.ConvertToProvider(original)!;
        var back = (BoardState)converter.ConvertFromProvider(json)!;

        Assert.Equal(original.Rows, back.Rows);
        Assert.Equal(original.Cols, back.Cols);
        Assert.Equal(original.Pieces, back.Pieces); // element-wise; BoardPiece is a scalar record
        Assert.Equal(json, (string)converter.ConvertToProvider(back)!);
        Assert.Equal(24, back.Pieces.Count);
    }

    [Fact]
    public void BoardState_json_uses_camelCase_property_names_and_string_enums()
    {
        var state = BoardMapper.ToState(GameEngine.CreateStartingBoard());

        var json = (string)new JsonbConverter<BoardState>().ConvertToProvider(state)!;

        Assert.Contains("\"rows\":8", json);
        Assert.Contains("\"pieces\":", json);
        Assert.Contains("\"kind\":\"Pharaoh\"", json);
        Assert.Contains("\"owner\":\"P1\"", json);
        Assert.DoesNotContain("\"Rows\"", json);
    }

    [Fact]
    public void LaserResult_round_trips_and_preserves_segment_order()
    {
        var board = GameEngine.CreateStartingBoard();
        var (_, outcome) = GameEngine.FireLaser(board, Player.P1);
        var original = BoardMapper.ToLaserResult(outcome, Player.P1, board);
        var converter = new JsonbConverter<LaserResult>();

        var json = (string)converter.ConvertToProvider(original)!;
        var back = (LaserResult)converter.ConvertFromProvider(json)!;

        Assert.Equal(json, (string)converter.ConvertToProvider(back)!);
        Assert.Equal(original.Segments, back.Segments); // element-wise; order preserved
        Assert.Equal(original.Emitter, back.Emitter);
        // P1's Classic emitter is the fixed bottom-right corner firing up — the emitter now
        // rides on LaserOutcome rather than being re-derived in BoardMapper; pin the value.
        Assert.Equal(new EmitterInfo(7, 9, "Up"), back.Emitter);
        Assert.Equal("P1", back.FiredBy);
        Assert.Equal("ExitedBoard", back.Termination);
    }

    [Fact]
    public void JsonbComparer_treats_equal_values_as_equal_and_changed_values_as_different()
    {
        var comparer = new JsonbComparer<BoardState>();
        var a = BoardMapper.ToState(GameEngine.CreateStartingBoard());
        var b = BoardMapper.ToState(GameEngine.CreateStartingBoard());
        var moved = BoardMapper.ToState(
            GameEngine.ApplyMove(GameEngine.CreateStartingBoard(), EngineMove.Shift(new Coord(4, 1), new Coord(3, 1))));

        Assert.True(comparer.Equals(a, b));
        Assert.False(comparer.Equals(a, moved));
    }
}
