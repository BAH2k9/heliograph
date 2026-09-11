using Khet.Contracts;

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

    /// <summary>
    /// Set only in a bot game, when this human move flipped <c>Game.CurrentTurn</c> onto the bot's
    /// seat: the bot's own reply, played inline in the same request/transaction as
    /// <see cref="Response"/>. The controller broadcasts both (in order, human then bot) as
    /// <c>moveApplied</c> and returns <em>this</em> one as the HTTP response body — see
    /// <see cref="GameService.SubmitMoveAsync"/>'s doc comment — so a client gets both plies from
    /// one round trip without a follow-up <c>GET</c>.
    /// </summary>
    public SubmitMoveResponse? BotFollowUp { get; private init; }

    public string? Error { get; private init; }

    public GameEndedResponse? GameEnded { get; private init; }

    public static SubmitMoveResult Ok(SubmitMoveResponse response, SubmitMoveResponse? botFollowUp = null) =>
        new() { Kind = ResultKind.Ok, Response = response, BotFollowUp = botFollowUp };

    public static SubmitMoveResult NotFound() => new() { Kind = ResultKind.NotFound };

    public static SubmitMoveResult Finished() =>
        new() { Kind = ResultKind.Finished, Error = "game is already finished" };

    public static SubmitMoveResult Illegal(string reason) =>
        new() { Kind = ResultKind.Illegal, Error = reason };

    public static SubmitMoveResult TimedOut(GameEndedResponse gameEnded) =>
        new() { Kind = ResultKind.TimedOut, GameEnded = gameEnded };
}
