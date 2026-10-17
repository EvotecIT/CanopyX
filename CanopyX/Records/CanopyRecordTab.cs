using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A tab of the record panel (for example Overview, Fields, Related or History): a set of top-level sections.</summary>
/// <remarks>Sections no tab lists join the last tab, so a record never loses a field. A tab whose sections are all empty is not shown.</remarks>
public sealed class CanopyRecordTab {
    /// <summary>Creates a tab.</summary>
    /// <param name="id">The tab id, unique within the record panel.</param>
    /// <param name="label">The visible tab label, 1 to 256 characters.</param>
    /// <exception cref="ArgumentException">The id is empty or the label is blank or too long.</exception>
    public CanopyRecordTab(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        if (string.IsNullOrWhiteSpace(label) || label.Length > 256) throw new ArgumentException("A tab label has 1 to 256 visible characters.", nameof(label));
        Id = id;
        Label = label;
    }

    /// <summary>Gets the tab id.</summary>
    public string Id { get; }

    /// <summary>Gets the visible label.</summary>
    public string Label { get; }

    /// <summary>Gets the ids of the top-level sections the tab shows, in order.</summary>
    public IList<string> Sections { get; } = new List<string>();

    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject().Property("id", Id).Property("label", Label).StringArray("sections", Sections).EndObject();
}
