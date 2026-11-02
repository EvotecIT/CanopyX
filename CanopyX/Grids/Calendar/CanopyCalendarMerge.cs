using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Merges copies of one event in several sources of a <see cref="CanopyCalendar"/>: events of different sources with the same
/// title (ignoring case and surrounding space), start, end, all-day flag and location draw once, with every owner's face in
/// source order. The first owner's copy is the one that opens and exports; linked views see the records of every copy. A new
/// instance keeps the first owner's colour and writes <c>"merge": true</c>.
/// </summary>
public sealed class CanopyCalendarMerge {
    /// <summary>Gets or sets the tone of merged events, a "shared" colour of their own; <see cref="CanopyTone.None"/> (the default) keeps the first owner's.</summary>
    public CanopyTone Tone { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        if (Tone.Name == null) { writer.Boolean(true); return; }
        writer.BeginObject().Property("tone", Tone.Name).EndObject();
    }
}
