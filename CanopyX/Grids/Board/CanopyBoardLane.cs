using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A board lane's raw typed identity, display label and optional work-in-progress threshold.</summary>
public sealed class CanopyBoardLane {
    private string _label;
    private int? _wipLimit;

    /// <summary>Creates a lane. Null represents both missing and empty cells; display metadata on the value is ignored.</summary>
    /// <param name="value">The raw lane value, checked against the board's column when the grid is validated.</param>
    /// <param name="label">The lane heading.</param>
    public CanopyBoardLane(CanopyCell? value, string label) {
        Value = value;
        if (string.IsNullOrWhiteSpace(label)) throw new ArgumentException("A board lane label is required.", nameof(label));
        _label = label;
    }

    /// <summary>Gets the raw identity. Text, booleans, numbers and dates retain their types on the wire.</summary>
    public CanopyCell? Value { get; }

    /// <summary>Gets or sets the lane heading, which must not be blank.</summary>
    public string Label {
        get => _label;
        set => _label = string.IsNullOrWhiteSpace(value) ? throw new ArgumentException("A board lane label is required.", nameof(value)) : value;
    }

    /// <summary>Gets or sets the work-in-progress threshold, 1 to 100,000; null means no limit. A full lane prevents additional local moves
    /// into it, while existing over-limit records remain visible and may move out. Hosts revalidate limits against their complete dataset.</summary>
    public int? WipLimit {
        get => _wipLimit;
        set => _wipLimit = value < 1 || value > 100000 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A board WIP limit is 1 to 100,000.") : value;
    }

    /// <summary>Tests a raw cell value against this lane using exact text, boolean, numeric and millisecond date identities.
    /// Cell display metadata is ignored; missing and nonfinite cell values match the null lane.</summary>
    /// <param name="value">The record's lane or swimlane cell.</param>
    /// <returns>Whether the cell belongs to this lane.</returns>
    public bool Matches(CanopyCell? value) =>
        CanopyGridFacets.Key(CanopyGridValues.Normalize(Value?.Value), exactTokens: true) ==
        CanopyGridFacets.Key(CanopyGridValues.Normalize(value?.Value), exactTokens: true);

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("value");
        if (Value == null) writer.Null(); else Value.WriteValue(writer);
        writer.Property("label", Label).OptionalProperty("wipLimit", WipLimit).EndObject();
    }
}
