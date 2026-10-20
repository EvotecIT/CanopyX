using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>The review page's preview of what submitting does (the <c>preview</c> hook's answer): a title, rows and notes. Text only.</summary>
public sealed class CanopyFlowPreview {
    /// <summary>Creates a preview.</summary>
    /// <param name="title">A line above the rows, or null.</param>
    public CanopyFlowPreview(string? title = null) {
        Title = CanopyFlowText.Optional(title, nameof(title));
    }

    /// <summary>Gets the line above the rows, or null.</summary>
    public string? Title { get; }

    /// <summary>Gets the rows (at most 50 show).</summary>
    public IList<CanopyFlowPreviewRow> Rows { get; } = new List<CanopyFlowPreviewRow>();

    /// <summary>Gets the notes under the rows (at most 10 show).</summary>
    public IList<string> Notes { get; } = new List<string>();

    /// <summary>Adds a row.</summary>
    /// <param name="label">The label.</param>
    /// <param name="value">The value.</param>
    /// <param name="tone">How the value reads.</param>
    /// <returns>The preview.</returns>
    public CanopyFlowPreview Row(string label, string value, CanopyFlowTone tone = CanopyFlowTone.Neutral) { Rows.Add(new CanopyFlowPreviewRow(label, value, tone)); return this; }

    /// <summary>Adds a note.</summary>
    /// <param name="text">The note.</param>
    /// <returns>The preview.</returns>
    public CanopyFlowPreview Note(string text) { Notes.Add(CanopyFlowText.Require(text, nameof(text))); return this; }

    /// <summary>Writes the preview as the browser reads it.</summary>
    /// <returns>Compact JSON.</returns>
    public string ToJson() {
        var writer = new CanopyJsonWriter(256);
        writer.BeginObject().OptionalProperty("title", Title).Name("rows").BeginArray();
        foreach (var row in Rows) {
            writer.BeginObject().Property("label", row.Label).Property("value", row.Value);
            if (row.Tone != CanopyFlowTone.Neutral) writer.Property("tone", CanopyFlowJson.Tone(row.Tone));
            writer.EndObject();
        }

        writer.EndArray();
        CanopyFlowJson.Texts(writer, "notes", Notes);
        return writer.EndObject().ToString();
    }
}