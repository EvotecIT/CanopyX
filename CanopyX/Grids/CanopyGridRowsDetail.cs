using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A record's detail payload for a nested grid: the inline rows of the definition's <see cref="CanopyGridDetail.View"/>.</summary>
/// <remarks>Grid detail rows are as tall as their content; <see cref="CanopyDetail.Height"/> does not apply to them.</remarks>
public sealed class CanopyGridRowsDetail : CanopyDetail {
    /// <summary>Gets the nested grid's rows, with identities unique within this record.</summary>
    public IList<CanopyGridRow> Rows { get; } = new List<CanopyGridRow>();

    internal override string Type => "grid";

    internal override void WriteContent(CanopyJsonWriter writer) {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        writer.Name("rows").BeginArray();
        foreach (var row in Rows) {
            if (row == null || !ids.Add(row.Id)) throw new InvalidOperationException("Nested detail rows need unique identities.");
            row.WriteJson(writer);
        }
        writer.EndArray();
    }
}
