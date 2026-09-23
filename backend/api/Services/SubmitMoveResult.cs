using Heliograph.Contracts;

namespace Heliograph.Api.Services;

/// <summary>Outcome of <see cref="GameService.SubmitMoveAsync"/>, mapped to HTTP by the controller.</summary>
public sealed record SubmitMoveResult
{
    public enum ResultKind
    {
        Ok,
        NotFound,
        Finished,
        Illegal,

        /// <summary>
        /// The submitted move arrived after the mover's clock had already expired — the game was
        /// just ended by timeout as a side effect of this call, and the submitted move was never
        /// applied. The controller returns 409 + <see cref="GameEnded"/>, and broadcasts it as
        /// <c>gameEnded</c> — never as a synthetic <c>moveApplied</c>.
        /// </summary>
        TimedOut,
    }

    public ResultKind Kind { get; private init; }

    public SubmitMoveResponse? Response { get; private init; }

    public string? Error { get; private init; }

    public GameEndedResponse? GameEnded { get; private init; }

    public static SubmitMoveResult Ok(SubmitMoveResponse response) =>
        new() { Kind = ResultKind.Ok, Response = response };

    public static SubmitMoveResult NotFound() => new() { Kind = ResultKind.NotFound };

    public static SubmitMoveResult Finished() =>
        new() { Kind = ResultKind.Finished, Error = "game is already finished" };

    public static SubmitMoveResult Illegal(string reason) =>
        new() { Kind = ResultKind.Illegal, Error = reason };

    public static SubmitMoveResult TimedOut(GameEndedResponse gameEnded) =>
        new() { Kind = ResultKind.TimedOut, GameEnded = gameEnded };
}
