namespace Khet.Engine;

/// <summary>
/// The rule variant a game is played under. Behaviour that is intrinsic to a piece kind
/// (an obelisk absorbing two hits, a pyramid reflecting) is <em>not</em> configured here —
/// this only carries the rules that genuinely differ between Khet editions. Nothing in the
/// engine reads these flags yet; they are threaded through from game creation so later work
/// (rotating Sphinx, stack/unstack moves) has a home.
/// </summary>
public sealed record RuleSet(string Name, bool RotatingSphinx, bool StackableObelisks);

/// <summary>The known named rule variants. <see cref="For"/> resolves a name coming off the wire or DB.</summary>
public static class RuleSets
{
    /// <summary>Original Khet: a fixed corner laser emitter; obelisks stand two-high (stack/unstack moves).</summary>
    public static readonly RuleSet Classic = new("Classic", RotatingSphinx: false, StackableObelisks: true);

    /// <summary>
    /// Khet 2.0: the laser is the rotating <c>Sphinx</c> piece in each corner. Obelisks do not
    /// stack (the Anubis directional blocker replaces them — a later change; for now the Khet2
    /// layout still carries plain two-hit obelisks).
    /// </summary>
    public static readonly RuleSet Khet2 = new("Khet2", RotatingSphinx: true, StackableObelisks: false);

    private static readonly IReadOnlyDictionary<string, RuleSet> ByName =
        new[] { Classic, Khet2 }.ToDictionary(r => r.Name, StringComparer.OrdinalIgnoreCase);

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
