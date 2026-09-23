using Heliograph.Api.Domain;
using Heliograph.Api.Mapping;
using Heliograph.Clock;
using Heliograph.Engine;
using Heliograph.Engine.Enums;

namespace Heliograph.Api.Services;

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

    /// <summary>
    /// A fresh game on <paramref name="layout"/>'s arrangement for <paramref name="ruleset"/>.
    /// </summary>
    /// <remarks>
    /// Request input has already been through <see cref="Resolve"/>, so the only way an unknown
    /// layout name gets here is from a stored row — a rematch of, or a stale invite for, a game on
    /// a layout that has since been retired. Those fall back to <see cref="BoardLayouts.DefaultName"/>
    /// rather than failing: the same rule that has an invite validated at send time so accepting
    /// it later can never 400.
    /// </remarks>
    public static Game NewGame(string ruleset, string layout, DateTime now, Player firstPlayer = Player.P1)
    {
        var setup = BoardLayouts.For(BoardLayouts.IsKnown(layout) ? layout : BoardLayouts.DefaultName, RuleSets.For(ruleset));
        return new()
        {
            Id = Guid.NewGuid(),
            CreatedAtUtc = now,
            Status = GameStatus.InProgress,
            CurrentTurn = firstPlayer,
            MoveCount = 0,
            RulesVersion = RulesVersion,
            Ruleset = ruleset,
            Layout = setup.Name,
            State = BoardMapper.ToState(setup.Build()),
        };
    }

    /// <summary>
    /// Normalises and validates the requested ruleset/layout names. A null/blank ruleset →
    /// <see cref="RuleSets.Classic"/>; a null/blank layout → <see cref="BoardLayouts.DefaultName"/>.
    /// The returned names are the registry's canonical casing. Throws
    /// <see cref="UnknownRuleSetException"/> / <see cref="UnknownBoardLayoutException"/> (→ 400) on an unknown name.
    /// </summary>
    public static (string Ruleset, string Layout) Resolve(string? ruleset, string? layout) =>
        (RuleSets.For(string.IsNullOrWhiteSpace(ruleset) ? RuleSets.Classic.Name : ruleset.Trim()).Name,
         BoardLayouts.For(string.IsNullOrWhiteSpace(layout) ? BoardLayouts.DefaultName : layout.Trim()).Name);

    /// <summary>Null/blank → untimed (null). Throws <see cref="UnknownTimeControlException"/> (→ 400) on an unknown name.</summary>
    public static string? ResolveTimeControl(string? timeControl) =>
        string.IsNullOrWhiteSpace(timeControl) ? null : TimeControls.For(timeControl.Trim()).Name;

    /// <summary>Null/blank → P1. Throws <see cref="MoveRequestException"/> (→ 400) on an unknown name.</summary>
    public static Player ResolveFirstPlayer(string? firstPlayer) =>
        string.IsNullOrWhiteSpace(firstPlayer)
            ? Player.P1
            : Enum.TryParse<Player>(firstPlayer.Trim(), ignoreCase: true, out var parsed)
                ? parsed
                : throw new MoveRequestException($"unknown player '{firstPlayer}'");

    public static Player Other(Player player) => player == Player.P1 ? Player.P2 : Player.P1;
}
