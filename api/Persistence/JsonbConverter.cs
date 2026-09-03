using System.Text.Json;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Khet.Api.Persistence;

/// <summary>
/// Stores <typeparamref name="T"/> as a JSON string in a <c>jsonb</c> column, using
/// <see cref="KhetJson.Options"/>. The EF model type stays <c>string</c>, so the shape of
/// <typeparamref name="T"/> can change without a migration.
/// </summary>
public sealed class JsonbConverter<T>() : ValueConverter<T, string>(
    value => JsonSerializer.Serialize(value, KhetJson.Options),
    json => JsonSerializer.Deserialize<T>(json, KhetJson.Options)!);
