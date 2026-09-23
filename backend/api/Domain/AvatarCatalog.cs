namespace Khet.Api.Domain;

/// <summary>
/// The fixed set of pickable avatar ids — 8 inline-SVG icons (the sun and signalling / optical
/// instruments) rendered entirely on the frontend (<c>web/src/components/Avatar.tsx</c>'s
/// <c>AVATAR_IDS</c> / <c>GLYPHS</c>). No file
/// storage, no upload endpoint: the backend only ever stores/validates one of these known strings
/// on <see cref="ApplicationUser.AvatarId"/>. Mirrors <see cref="Khet.Engine.RuleSets"/>/
/// <see cref="Khet.Clock.TimeControls"/>' static-registry <c>For</c>/<c>IsKnown</c> shape, even though there's
/// no richer value type here — just the id strings themselves, case-sensitive (unlike the other two
/// registries) since these are opaque keys shared verbatim with the frontend's own map, not a
/// user-typed name that benefits from case-insensitive matching.
/// </summary>
public static class AvatarCatalog
{
    public static readonly IReadOnlyList<string> Names =
    [
        "sun", "tower", "lens", "compass", "gear", "kite", "lantern", "sextant",
    ];
    // Replaced wholesale in the Heliograph rebrand. Ids stored under the old set are no longer
    // accepted on PATCH; the data migration remaps them one to one, and until it runs the frontend
    // renders an unknown stored id as its initial-letter fallback.

    private static readonly HashSet<string> ById = new(Names, StringComparer.Ordinal);

    public static bool IsKnown(string id) => ById.Contains(id);

    /// <summary>Resolves an avatar id. Throws <see cref="UnknownAvatarException"/> if it's not in the pinned set.</summary>
    public static string For(string id) =>
        ById.Contains(id) ? id : throw new UnknownAvatarException(id);
}

/// <summary>An avatar id outside the pinned 8-icon set was supplied. The API surfaces it as 400.</summary>
public sealed class UnknownAvatarException(string id) : Exception($"unknown avatar '{id}'")
{
    public string Id { get; } = id;
}
