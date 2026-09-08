using Khet.Api.Domain;
using Khet.Api.Mapping;
using Khet.Engine;
using Khet.Engine.Enums;

namespace Khet.Api.Services;

/// <summary>
/// Pure, stateless helpers shared across the <see cref="GameService"/> partials — and, after the
/// A→B hybrid steps, across <c>GameEndService</c> / <c>RoomService</c> too. Extracted from
/// <see cref="GameService"/> only because a <c>private</c> member can't be reached from a sibling
/// class; the bodies are byte-for-byte what they were on <see cref="GameService"/>. Not a factory
/// abstraction — no state, no behaviour, just functions that needed a home visible to more than
/// one class.
/// </summary>
internal static class GameHelpers
{
    private const int RulesVersion = 1;

    public static Game NewGame(string ruleset, string layout, DateTime now, Player firstPlayer = Player.P1) => new()
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

    /// <summary>
    /// Normalises and validates the requested ruleset/layout names. Null/blank → <c>"Classic"</c>;
    /// the returned names are the registry's canonical casing. Throws
    /// <see cref="UnknownRuleSetException"/> / <see cref="UnknownBoardLayoutException"/> (→ 400) on an unknown name.
    /// </summary>
    public static (string Ruleset, string Layout) Resolve(string? ruleset, string? layout) =>
        (RuleSets.For(string.IsNullOrWhiteSpace(ruleset) ? "Classic" : ruleset.Trim()).Name,
         BoardLayouts.For(string.IsNullOrWhiteSpace(layout) ? "Classic" : layout.Trim()).Name);

    /// <summary>Null/blank → P1. Throws <see cref="MoveRequestException"/> (→ 400) on an unknown name.</summary>
    public static Player ResolveFirstPlayer(string? firstPlayer) =>
        string.IsNullOrWhiteSpace(firstPlayer)
            ? Player.P1
            : Enum.TryParse<Player>(firstPlayer.Trim(), ignoreCase: true, out var parsed)
                ? parsed
                : throw new MoveRequestException($"unknown player '{firstPlayer}'");

    public static Player Other(Player player) => player == Player.P1 ? Player.P2 : Player.P1;
}
