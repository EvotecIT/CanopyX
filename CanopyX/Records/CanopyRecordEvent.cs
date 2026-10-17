using System;
using System.Collections.Generic;
using System.Globalization;
using CanopyX.Json;

namespace CanopyX;

/// <summary>One event of a record's timeline (<see cref="CanopyCell.Events"/>): when it happened, who did it, what kind of event
/// it is, a summary, and the fields it changed.</summary>
public sealed class CanopyRecordEvent {
    private string _summary;

    /// <summary>Creates an event.</summary>
    /// <param name="time">When it happened. A local time is converted to UTC; an unspecified one is taken as UTC.</param>
    /// <param name="summary">A plain-text summary, 1 to 4,096 characters.</param>
    /// <exception cref="ArgumentException">The summary is blank or too long.</exception>
    public CanopyRecordEvent(DateTime time, string summary) {
        Time = time;
        _summary = CheckSummary(summary);
    }

    /// <summary>Gets or sets when the event happened, in UTC; null for an event without a time.</summary>
    public DateTime? Time {
        get => _time;
        set => _time = value is DateTime time ? time.Kind == DateTimeKind.Local ? time.ToUniversalTime() : DateTime.SpecifyKind(time, DateTimeKind.Utc) : null;
    }

    private DateTime? _time;

    /// <summary>Gets or sets the plain-text summary.</summary>
    /// <exception cref="ArgumentException">The summary is blank or longer than 4,096 characters.</exception>
    public string Summary { get => _summary; set => _summary = CheckSummary(value); }

    /// <summary>Gets or sets who caused the event, for example a person or a service.</summary>
    public string? Actor { get; set; }

    /// <summary>Gets or sets the kind of event, shown as a chip (for example "Reminder" or "Change").</summary>
    public string? Kind { get; set; }

    /// <summary>Gets or sets the tone of the event's marker and kind chip.</summary>
    public CanopyTone Tone { get; set; }

    /// <summary>Gets or sets a record the event links to; its summary then opens that record.</summary>
    public CanopyRecordRef? Ref { get; set; }

    /// <summary>Gets the fields the event changed, shown under it as before and after values.</summary>
    public IList<CanopyFieldChange> Changes { get; } = new List<CanopyFieldChange>();

    private static string CheckSummary(string summary) =>
        string.IsNullOrWhiteSpace(summary) || summary.Length > 4096 ? throw new ArgumentException("An event summary has 1 to 4,096 visible characters.", nameof(summary)) : summary;

    internal void WriteJson(CanopyJsonWriter writer) {
        if ((Actor?.Length ?? 0) > 4096 || (Kind?.Length ?? 0) > 256 || Changes.Count > 512) throw new InvalidOperationException("An event's actor, kind and changes must fit their bounds.");
        writer.BeginObject();
        if (Time.HasValue) writer.Property("time", DateTime.SpecifyKind(Time.Value, DateTimeKind.Utc).ToString(Time.Value.Millisecond == 0 ? "yyyy-MM-dd'T'HH:mm:ss'Z'" : "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture));
        writer.Property("summary", _summary).OptionalProperty("actor", Actor).OptionalProperty("kind", Kind).OptionalProperty("tone", Tone.Name);
        if (Ref != null) { writer.Name("ref"); Ref.WriteJson(writer); }
        if (Changes.Count > 0) {
            writer.Name("changes").BeginArray();
            foreach (var change in Changes) (change ?? throw new InvalidOperationException("An event cannot contain a null change.")).WriteJson(writer);
            writer.EndArray();
        }
        writer.EndObject();
    }
}
