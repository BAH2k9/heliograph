namespace Khet.Api.Domain;

/// <summary>
/// A chess.com-style time control preset. Mirrors <see cref="Engine.RuleSet"/>'s pattern: a small
/// value type plus a static registry of the known named presets, resolved by name off the wire or
/// DB. Lives in <c>Domain/</c>, not <c>Engine/</c>, so the pure rules engine stays clock-free.
/// </summary>
/// <param name="Name">Wire/DB identity — the only part of a preset ever persisted (see <see cref="Domain.Game.TimeControl"/>).</param>
/// <param name="Category">Bullet/Blitz/Rapid share one live clock mechanism; Daily is a config variant of the same mechanism (see <see cref="ClockMath"/>).</param>
/// <param name="InitialSeconds">Starting bank per player, in seconds. 0 for Daily (it has no banked-time balance — see <see cref="DaysPerMove"/>).</param>
/// <param name="IncrementSeconds">Seconds added to the mover's bank after each of their moves. 0 for Daily.</param>
/// <param name="DaysPerMove">Daily only: days added to <see cref="Domain.Game.TurnDeadlineUtc"/> after each move, replacing the whole deadline rather than banking. 0 for Bullet/Blitz/Rapid.</param>
public sealed record TimeControl(string Name, TimeControlCategory Category, int InitialSeconds, int IncrementSeconds, int DaysPerMove);

/// <summary>The four time-control families a room can be created with. See <see cref="TimeControl.Category"/>.</summary>
public enum TimeControlCategory
{
    Bullet,
    Blitz,
    Rapid,
    Daily,
}

/// <summary>
/// The known named time-control presets — chess.com's own conventional values, fixed (no custom
/// minute/increment input) per product decision. <see cref="For"/> resolves a name coming off the
/// wire or DB. Only the preset <em>name</em> is ever persisted on <see cref="Domain.Game"/>, never
/// the raw numbers — avoids drift if a preset is retuned later.
/// </summary>
public static class TimeControls
{
    public static readonly TimeControl Bullet1_0 = new("1+0", TimeControlCategory.Bullet, 60, 0, 0);
    public static readonly TimeControl Bullet1_1 = new("1+1", TimeControlCategory.Bullet, 60, 1, 0);
    public static readonly TimeControl Bullet2_1 = new("2+1", TimeControlCategory.Bullet, 120, 1, 0);

    public static readonly TimeControl Blitz3_0 = new("3+0", TimeControlCategory.Blitz, 180, 0, 0);
    public static readonly TimeControl Blitz3_2 = new("3+2", TimeControlCategory.Blitz, 180, 2, 0);
    public static readonly TimeControl Blitz5_0 = new("5+0", TimeControlCategory.Blitz, 300, 0, 0);
    public static readonly TimeControl Blitz5_3 = new("5+3", TimeControlCategory.Blitz, 300, 3, 0);

    public static readonly TimeControl Rapid10_0 = new("10+0", TimeControlCategory.Rapid, 600, 0, 0);
    public static readonly TimeControl Rapid10_5 = new("10+5", TimeControlCategory.Rapid, 600, 5, 0);
    public static readonly TimeControl Rapid15_10 = new("15+10", TimeControlCategory.Rapid, 900, 10, 0);

    public static readonly TimeControl Daily1 = new("1/move", TimeControlCategory.Daily, 0, 0, 1);
    public static readonly TimeControl Daily3 = new("3/move", TimeControlCategory.Daily, 0, 0, 3);
    public static readonly TimeControl Daily7 = new("7/move", TimeControlCategory.Daily, 0, 0, 7);

    private static readonly IReadOnlyDictionary<string, TimeControl> ByName =
        new[]
        {
            Bullet1_0, Bullet1_1, Bullet2_1,
            Blitz3_0, Blitz3_2, Blitz5_0, Blitz5_3,
            Rapid10_0, Rapid10_5, Rapid15_10,
            Daily1, Daily3, Daily7,
        }.ToDictionary(t => t.Name, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyCollection<string> Names => (IReadOnlyCollection<string>)ByName.Keys;

    public static bool IsKnown(string name) => ByName.ContainsKey(name);

    /// <summary>Resolves a preset by name (case-insensitive). Throws <see cref="UnknownTimeControlException"/> if unknown.</summary>
    public static TimeControl For(string name) =>
        ByName.TryGetValue(name, out var timeControl)
            ? timeControl
            : throw new UnknownTimeControlException(name);
}

/// <summary>A room was asked for with a time control name that is not in the registry. The API surfaces it as 400.</summary>
public sealed class UnknownTimeControlException(string name)
    : Exception($"unknown time control '{name}'")
{
    public string Name { get; } = name;
}

/// <summary>
/// Name lookup for <see cref="TimeControlCategory"/> itself (not a preset) — used to validate
/// <c>GET /api/leaderboard?category=...</c>, which takes a category name directly rather than a
/// preset name. Deliberately name-based rather than <c>Enum.TryParse</c>: that would also accept a
/// bare numeric string ("0", "1", ...) as a valid category, which isn't a name a caller should be
/// able to use off the wire.
/// </summary>
public static class TimeControlCategories
{
    private static readonly IReadOnlyDictionary<string, TimeControlCategory> ByName =
        new Dictionary<string, TimeControlCategory>(StringComparer.OrdinalIgnoreCase)
        {
            [nameof(TimeControlCategory.Bullet)] = TimeControlCategory.Bullet,
            [nameof(TimeControlCategory.Blitz)] = TimeControlCategory.Blitz,
            [nameof(TimeControlCategory.Rapid)] = TimeControlCategory.Rapid,
            [nameof(TimeControlCategory.Daily)] = TimeControlCategory.Daily,
        };

    /// <summary>Resolves a category by name (case-insensitive). False on a missing/unrecognized name.</summary>
    public static bool TryParse(string? name, out TimeControlCategory category)
    {
        if (name is not null && ByName.TryGetValue(name, out var found))
        {
            category = found;
            return true;
        }
        category = default;
        return false;
    }
}
