using System.Text.Json;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace Khet.Api.Persistence;

/// <summary>
/// Compares jsonb-backed values by their serialized form and snapshots them by round-trip,
/// so EF change-tracking notices when a <see cref="Domain.Game.State"/> object is replaced
/// wholesale. <c>GameService</c> also always assigns a fresh instance.
/// </summary>
public sealed class JsonbComparer<T>() : ValueComparer<T>(
    (a, b) => JsonSerializer.Serialize(a, KhetJson.Options) == JsonSerializer.Serialize(b, KhetJson.Options),
    v => v == null ? 0 : JsonSerializer.Serialize(v, KhetJson.Options).GetHashCode(),
    v => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(v, KhetJson.Options), KhetJson.Options)!);
