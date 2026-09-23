using System.Text.Json;
using System.Text.Json.Serialization;

namespace Heliograph.Api.Persistence;

/// <summary>The single JSON configuration used for jsonb columns and (matching it) HTTP bodies.</summary>
public static class HeliographJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Converters = { new JsonStringEnumConverter() },
    };
}
