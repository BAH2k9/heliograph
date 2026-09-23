using System.Text.Json;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace Heliograph.Api.Persistence;

/// <summary>
/// Compares jsonb-backed values by their serialized form and snapshots them by round-trip,
/// so EF change-tracking notices when a <see cref="Domain.Game.State"/> object is replaced
/// wholesale. <c>GameService</c> also always assigns a fresh instance.
/// </summary>
public sealed class JsonbComparer<T>() : ValueComparer<T>(
    (a, b) => JsonSerializer.Serialize(a, HeliographJson.Options) == JsonSerializer.Serialize(b, HeliographJson.Options),
    v => v == null ? 0 : JsonSerializer.Serialize(v, HeliographJson.Options).GetHashCode(),
    v => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(v, HeliographJson.Options), HeliographJson.Options)!);
