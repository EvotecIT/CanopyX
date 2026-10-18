using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A concurrency lane under each resource group of a <see cref="CanopyCalendar"/>'s timeline: how many of the group's events run
/// at once, coloured by thresholds.
/// </summary>
public sealed class CanopyCalendarCapacity {
    private string? _label;

    /// <summary>Gets the thresholds, 1 to 8 with rising <see cref="CanopyCalendarThreshold.At"/>.</summary>
    public IList<CanopyCalendarThreshold> Thresholds { get; } = new List<CanopyCalendarThreshold>();

    /// <summary>Gets or sets the lane's label; null uses the translated "Concurrent events".</summary>
    /// <exception cref="ArgumentException">The value is blank or longer than 256 characters.</exception>
    public string? Label {
        get => _label;
        set => _label = CanopyCalendarValues.Label(value, nameof(value));
    }

    /// <summary>Adds a threshold and returns the capacity, for fluent authoring.</summary>
    /// <param name="at">The number of events at once from which the tone applies, at least 1.</param>
    /// <param name="tone">The tone.</param>
    /// <returns>This capacity.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="at"/> is less than 1.</exception>
    /// <exception cref="ArgumentException"><paramref name="tone"/> is <see cref="CanopyTone.None"/>.</exception>
    public CanopyCalendarCapacity Add(int at, CanopyTone tone) {
        Thresholds.Add(new CanopyCalendarThreshold(at, tone));
        return this;
    }

    internal void Validate() {
        if (Thresholds.Count == 0 || Thresholds.Count > 8) throw new InvalidOperationException("A capacity lane has 1 to 8 thresholds.");
        var previous = 0;
        foreach (var threshold in Thresholds) {
            if (threshold == null || threshold.At <= previous) throw new InvalidOperationException("Capacity thresholds rise and cannot be null.");
            previous = threshold.At;
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("thresholds").BeginArray();
        foreach (var threshold in Thresholds) threshold.WriteJson(writer);
        writer.EndArray().OptionalProperty("label", _label).EndObject();
    }
}
