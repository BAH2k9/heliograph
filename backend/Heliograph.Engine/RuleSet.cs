namespace Heliograph.Engine;

/// <summary>
/// The rule variant a game is played under. Behaviour that is intrinsic to a piece kind
/// (a bastion absorbing two hits, a mirror reflecting) is <em>not</em> configured here —
/// this only carries the rules that genuinely differ between rulesets. Nothing in the
/// engine reads these flags yet; they are threaded through from game creation so later work
/// (rotating Heliostat, stack/unstack moves) has a home.
/// </summary>
public sealed record RuleSet(string Name, bool RotatingHeliostat, bool StackableBastions);

/// <summary>The known named rule variants. <see cref="For"/> resolves a name coming off the wire or DB.</summary>
public static class RuleSets
{
    /// <summary>Fixed Sun: a fixed corner laser emitter; bastions stand two-high (stack/unstack moves).</summary>
    public static readonly RuleSet FixedSun = new("FixedSun", RotatingHeliostat: false, StackableBastions: true);

    /// <summary>
    /// Turning Sun: the laser is the rotating <c>Heliostat</c> piece in each corner. Bastions do not
    /// stack (the Sentinel directional blocker replaces them).
    /// </summary>
    public static readonly RuleSet TurningSun = new("TurningSun", RotatingHeliostat: true, StackableBastions: false);

    private static readonly IReadOnlyDictionary<string, RuleSet> ByName =
        new[] { FixedSun, TurningSun }.ToDictionary(r => r.Name, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyCollection<string> Names => (IReadOnlyCollection<string>)ByName.Keys;

    public static bool IsKnown(string name) => ByName.ContainsKey(name);

    /// <summary>Resolves a ruleset by name (case-insensitive). Throws <see cref="UnknownRuleSetException"/> if unknown.</summary>
    public static RuleSet For(string name) =>
        ByName.TryGetValue(name, out var ruleSet)
            ? ruleSet
            : throw new UnknownRuleSetException(name);
}

/// <summary>A game was asked for with a ruleset name that is not in the registry. The API surfaces it as 400.</summary>
public sealed class UnknownRuleSetException(string name)
    : Exception($"unknown ruleset '{name}'")
{
    public string Name { get; } = name;
}
