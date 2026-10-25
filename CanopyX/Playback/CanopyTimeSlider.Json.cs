using System;
using System.Collections.Generic;
using System.Globalization;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyTimeSlider<T> where T : class {
    private static readonly string[] TimestampFormats = {
        "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'",
        "yyyy-MM-dd'T'HH:mm:sszzz", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFFzzz"
    };

    /// <summary>Writes an already validated slider; frame serializers produce complete, HTML-safe view documents.</summary>
    internal void WriteJson(CanopyJsonWriter writer, Func<T, string> serialize) {
        writer.BeginObject();
        if (IntervalMilliseconds != 1000) writer.Property("interval", IntervalMilliseconds);
        if (InitialIndex.HasValue) writer.Property("initial", InitialIndex.Value);
        writer.Name("snapshots").BeginArray();
        foreach (var snapshot in Snapshots) {
            writer.BeginObject().Property("at", snapshot.At.UtcDateTime.ToString("O", CultureInfo.InvariantCulture));
            writer.OptionalProperty("label", snapshot.Label).Name("view").Raw(serialize(snapshot.View)).EndObject();
        }

        writer.EndArray().EndObject();
    }

    /// <summary>Reads a slider through its view's parser, rejecting nesting before entering that parser.</summary>
    internal static CanopyTimeSlider<T> ReadFrom(object? node, Func<object?, T> readView) {
        const string what = "The time slider";
        var map = CanopyFlowContract.Object(node, what, "interval", "initial", "snapshots");
        var slider = new CanopyTimeSlider<T> {
            IntervalMilliseconds = CanopyFlowContract.Integer(map, "interval", what) ?? 1000,
            InitialIndex = CanopyFlowContract.Integer(map, "initial", what)
        };
        var frames = CanopyFlowContract.Items(map, "snapshots", what, 500);
        if (frames.Count == 0) throw new InvalidOperationException("A time slider holds 1 to 500 snapshots.");
        // Inspect the full collection before reading a view: even a later nested frame must never trigger recursion.
        var entries = new List<Dictionary<string, object?>>(frames.Count);
        foreach (var frame in frames) {
            var entry = CanopyFlowContract.Object(frame, "A time slider snapshot", "at", "label", "view");
            if (!entry.TryGetValue("view", out var view) || !(view is Dictionary<string, object?> viewMap))
                throw new InvalidOperationException("A time slider snapshot needs a complete view document.");
            if (viewMap.ContainsKey("timeSlider"))
                throw new InvalidOperationException("A time slider snapshot view must not contain a nested time slider.");
            entries.Add(entry);
        }

        foreach (var entry in entries) {
            var at = CanopyFlowContract.RequiredText(entry, "at", "A time slider snapshot");
            var fraction = at.IndexOf('.');
            if (fraction >= 0 && (fraction + 1 == at.Length || at[fraction + 1] < '0' || at[fraction + 1] > '9') ||
                !DateTimeOffset.TryParseExact(at, TimestampFormats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var instant))
                throw new InvalidOperationException("A time slider snapshot needs an ISO 8601 instant with a time zone in 'at'.");
            slider.Snapshots.Add(new CanopyTimeSnapshot<T>(instant, readView(entry["view"]), CanopyFlowContract.Text(entry, "label", "A time slider snapshot")));
        }

        return slider;
    }
}
