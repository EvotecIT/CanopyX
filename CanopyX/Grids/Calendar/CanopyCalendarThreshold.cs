using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A step of a <see cref="CanopyCalendarCapacity"/>: from <see cref="At"/> events at once, the concurrency lane takes <see cref="Tone"/>.</summary>
public sealed class CanopyCalendarThreshold {
    /// <summary>Creates a threshold.</summary>
    /// <param name="at">The number of events at once from which the tone applies, at least 1.</param>
    /// <param name="tone">The tone; not <see cref="CanopyTone.None"/>.</param>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="at"/> is less than 1.</exception>
    /// <exception cref="ArgumentException"><paramref name="tone"/> is <see cref="CanopyTone.None"/>.</exception>
    public CanopyCalendarThreshold(int at, CanopyTone tone) {
        if (at < 1) throw new ArgumentOutOfRangeException(nameof(at), at, "A threshold starts at 1 or more events.");
        if (tone == CanopyTone.None) throw new ArgumentException("A threshold needs a tone.", nameof(tone));
        At = at;
        Tone = tone;
    }

    /// <summary>Gets the number of events at once from which the tone applies.</summary>
    public int At { get; }

    /// <summary>Gets the tone.</summary>
    public CanopyTone Tone { get; }

    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject().Property("at", At).Property("tone", Tone.Name).EndObject();
}
