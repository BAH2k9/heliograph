namespace Heliograph.Contracts;

/// <summary>
/// A named bot difficulty tier. Same static-registry shape as <c>Heliograph.Engine.RuleSets</c> /
/// <c>Heliograph.Engine.BoardLayouts</c> / <c>Heliograph.Clock.TimeControls</c> — a small value type, a static
/// dictionary of named presets, and a <see cref="BotDifficulties.For"/> that throws a specific
/// <see cref="UnknownDifficultyException"/> (→ 400) on an unknown name. Lives in
/// <c>Heliograph.Contracts</c> rather than <c>Heliograph.Engine</c> because it names a <c>Heliograph.Api</c> bot
/// strategy (<c>BotService.ChooseMove</c>), not an engine rule — the engine has no concept of "how
/// hard" a move search should be.
/// </summary>
public sealed record BotDifficulty(string Name);

/// <summary>The three known bot difficulty tiers. <see cref="For"/> resolves a name coming off the wire or DB.</summary>
public static class BotDifficulties
{
    public static readonly BotDifficulty Easy = new("Easy");
    public static readonly BotDifficulty Medium = new("Medium");
    public static readonly BotDifficulty Hard = new("Hard");

    private static readonly IReadOnlyDictionary<string, BotDifficulty> ByName =
        new[] { Easy, Medium, Hard }.ToDictionary(d => d.Name, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyCollection<string> Names => (IReadOnlyCollection<string>)ByName.Keys;

    public static bool IsKnown(string name) => ByName.ContainsKey(name);

    /// <summary>Resolves a difficulty by name (case-insensitive). Throws <see cref="UnknownDifficultyException"/> if unknown.</summary>
    public static BotDifficulty For(string name) =>
        ByName.TryGetValue(name, out var difficulty)
            ? difficulty
            : throw new UnknownDifficultyException(name);
}

/// <summary>A bot game was asked for with a difficulty name that is not in the registry. The API surfaces it as 400.</summary>
public sealed class UnknownDifficultyException(string name)
    : Exception($"unknown bot difficulty '{name}'")
{
    public string Name { get; } = name;
}
