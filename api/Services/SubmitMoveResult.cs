using Khet.Api.Contracts;

namespace Khet.Api.Services;

/// <summary>Outcome of <see cref="GameService.SubmitMoveAsync"/>, mapped to HTTP by the controller.</summary>
public sealed record SubmitMoveResult
{
    public enum ResultKind
    {
        Ok,
        NotFound,
        Finished,
        Illegal,
    }

    public ResultKind Kind { get; private init; }

    public SubmitMoveResponse? Response { get; private init; }

    public string? Error { get; private init; }

    public static SubmitMoveResult Ok(SubmitMoveResponse response) =>
        new() { Kind = ResultKind.Ok, Response = response };

    public static SubmitMoveResult NotFound() => new() { Kind = ResultKind.NotFound };

    public static SubmitMoveResult Finished() =>
        new() { Kind = ResultKind.Finished, Error = "game is already finished" };

    public static SubmitMoveResult Illegal(string reason) =>
        new() { Kind = ResultKind.Illegal, Error = reason };
}
