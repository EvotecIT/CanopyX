using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Visual history metadata for one period, independent of the cell's raw query and export value.</summary>
public sealed class CanopyCellPeriod {
    /// <summary>Creates a period. Its label may be a date or a host-defined interval.</summary>
    /// <param name="period">Nonempty period label, at most 256 code units.</param>
    /// <param name="value">Optional finite numeric sample; null means no numeric data.</param>
    /// <param name="state">Optional plain-text state; null means no state data.</param>
    /// <param name="tone">Optional semantic tone.</param>
    public CanopyCellPeriod(string period, double? value = null, string? state = null, CanopyTone tone = default) {
        if (string.IsNullOrWhiteSpace(period) || period.Length > 256) throw new ArgumentException("A period requires a bounded nonblank label.", nameof(period));
        if (value.HasValue && !CanopyGridPresenter.Safe(value.Value)) throw new ArgumentOutOfRangeException(nameof(value));
        if (state != null && state.Length > 4096) throw new ArgumentOutOfRangeException(nameof(state));
        Period = period; Value = value; State = state; Tone = tone;
    }
    /// <summary>Gets the period label.</summary>
    public string Period { get; }
    /// <summary>Gets the optional numeric sample.</summary>
    public double? Value { get; }
    /// <summary>Gets the optional state label.</summary>
    public string? State { get; }
    /// <summary>Gets the semantic tone.</summary>
    public CanopyTone Tone { get; }
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("period", Period);
        if (Value.HasValue) writer.Name("value").Number(Value.Value);
        writer.OptionalProperty("state", State).OptionalProperty("tone", Tone.Name).EndObject();
    }
}
