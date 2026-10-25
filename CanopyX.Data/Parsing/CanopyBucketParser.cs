using System;
using System.Linq;
using System.Text.Json;

namespace CanopyX.Data;

/// <summary>Reads the bounded bucket shape used by grouping and facet requests.</summary>
internal static class CanopyBucketParser {
    internal static CanopyBucket? Read(JsonElement parent, CanopyColumn column, CanopyBucket? declared = null) {
        if (!parent.TryGetProperty("bucket", out var value)) return null;
        if (value.ValueKind != JsonValueKind.Object) throw Invalid();
        try {
            var kind = value.GetProperty("kind").GetString();
            CanopyBucket result;
            if (kind == "width") {
                CheckFields(value, "kind", "width", "origin");
                result = CanopyBucket.FixedWidth(value.GetProperty("width").GetDouble(), value.TryGetProperty("origin", out var origin) ? origin.GetDouble() : 0);
            } else if (kind == "edges") {
                CheckFields(value, "kind", "edges");
                var edges = value.GetProperty("edges");
                if (edges.ValueKind != JsonValueKind.Array || edges.GetArrayLength() > 200) throw Invalid();
                result = CanopyBucket.ExplicitEdges(edges.EnumerateArray().Select(edge => edge.GetDouble()).ToArray());
            } else {
                CheckFields(value, "kind", "timeZone", "firstWeekday");
                if (!Enum.TryParse<CanopyBucketKind>(kind, true, out var calendar) || calendar.ToString().ToLowerInvariant() != kind) throw Invalid();
                var zone = value.TryGetProperty("timeZone", out var timeZone) ? timeZone.GetString() : "UTC";
                var first = value.TryGetProperty("firstWeekday", out var firstDay) ? firstDay.GetInt32() : 1;
                result = declared?.NativeZone != null && declared.TimeZone == zone ? CanopyBucket.Calendar(calendar, declared.NativeZone, zone!, (DayOfWeek)first) : CanopyBucket.Calendar(calendar, zone!, (DayOfWeek)first);
            }
            result.Validate(column);
            return result;
        } catch (CanopyRequestException) { throw; }
        catch (Exception error) when (error is ArgumentException || error is InvalidOperationException || error is FormatException || error is System.Collections.Generic.KeyNotFoundException || error is TimeZoneNotFoundException || error is InvalidTimeZoneException) {
            throw Invalid();
        }
    }

    private static void CheckFields(JsonElement value, params string[] allowed) {
        var seen = new System.Collections.Generic.HashSet<string>(StringComparer.Ordinal);
        foreach (var field in value.EnumerateObject()) if (!allowed.Contains(field.Name) || !seen.Add(field.Name)) throw Invalid();
    }
    private static CanopyRequestException Invalid() => new CanopyRequestException(CanopyRequestError.InvalidGroupBy, "A bucket needs a supported kind, matching column and bounded partition settings.");
}
