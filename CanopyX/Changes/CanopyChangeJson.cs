using System;
using System.Collections.Generic;
using System.Globalization;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Shared reading and writing of the change views' documents: the envelope, tones and times.</summary>
internal static class CanopyChangeJson {
    /// <summary>The document as an object with the protocol, the type and only the named properties.</summary>
    internal static Dictionary<string, object?> Envelope(object? node, string what, string type, string[] names) {
        var allowed = new string[names.Length + 2];
        allowed[0] = "protocol";
        allowed[1] = "type";
        Array.Copy(names, 0, allowed, 2, names.Length);
        var map = CanopyFlowContract.Object(node, what, allowed);
        if (CanopyFlowContract.Text(map, "protocol", what) != CanopyProtocol.Version || CanopyFlowContract.Text(map, "type", what) != type)
            throw new InvalidOperationException(what + " must have protocol " + CanopyProtocol.Version + " and type \"" + type + "\".");
        return map;
    }

    /// <summary>An optional <c>tone</c>: a tone name, or none.</summary>
    internal static CanopyTone Tone(Dictionary<string, object?> map, string what) {
        var tone = CanopyFlowContract.Text(map, "tone", what);
        if (tone == null) return default;
        try { return CanopyTone.Named(tone); } catch (ArgumentException error) { throw new InvalidOperationException(what + " has an invalid tone.", error); }
    }

    /// <summary>An optional time: ISO 8601 with a zone (or UTC when it has none).</summary>
    internal static DateTimeOffset? Time(Dictionary<string, object?> map, string name, string what) {
        var text = CanopyFlowContract.Text(map, name, what);
        if (text == null) return null;
        if (!DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var moment) || text.IndexOf('T') < 0)
            throw new InvalidOperationException(what + " needs an ISO 8601 date and time in '" + name + "'.");
        return moment;
    }

    /// <summary>Writes a time in UTC, as <c>2026-10-21T10:42:05Z</c> with milliseconds when it has them.</summary>
    internal static CanopyJsonWriter Time(this CanopyJsonWriter writer, string name, DateTimeOffset? value) =>
        value.HasValue ? writer.Property(name, value.Value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.FFF'Z'", CultureInfo.InvariantCulture)) : writer;

    /// <summary>The time zone's wire name.</summary>
    internal static void TimeZone(CanopyJsonWriter writer, CanopyTimeZone zone) {
        if (zone == CanopyTimeZone.Local) writer.Property("timeZone", "local");
    }

    internal static CanopyTimeZone ReadTimeZone(Dictionary<string, object?> map, string what) {
        var zone = CanopyFlowContract.Text(map, "timeZone", what);
        return zone == null ? CanopyTimeZone.Utc : CanopyFlowContract.Choose(zone, what, "timeZone", ("utc", CanopyTimeZone.Utc), ("local", CanopyTimeZone.Local));
    }
}
