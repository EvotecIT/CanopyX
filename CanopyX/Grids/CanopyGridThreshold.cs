using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An inclusive upper numeric bound mapped to a host-supplied semantic tone.</summary>
public sealed class CanopyGridThreshold {
    /// <summary>Creates a threshold.</summary>
    /// <param name="upperBound">Finite bound within the safe numeric magnitude.</param>
    /// <param name="tone">Semantic tone used when a value is at or below the bound.</param>
    public CanopyGridThreshold(double upperBound, CanopyTone tone) {
        if (!CanopyGridPresenter.Safe(upperBound)) throw new ArgumentOutOfRangeException(nameof(upperBound));
        UpperBound = upperBound; Tone = tone;
    }
    /// <summary>Gets the inclusive upper bound.</summary>
    public double UpperBound { get; }
    /// <summary>Gets the semantic tone.</summary>
    public CanopyTone Tone { get; }
    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject().Name("upperBound").Number(UpperBound).Property("tone", Tone.Name ?? "neutral").EndObject();
}
