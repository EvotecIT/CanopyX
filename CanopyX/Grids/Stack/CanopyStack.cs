using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An ordered explanation of host-supplied layers and their single winning result.</summary>
/// <remarks>The host supplies order, reasons and all state. CanopyX never evaluates rules or domain precedence.</remarks>
public sealed class CanopyStack {
    private string? _titleColumn;

    /// <summary>Creates an empty stack; add layers in the processing order supplied by the host.</summary>
    public CanopyStack() { }

    /// <summary>Gets or sets the title column. Null uses the row-header column, then the first visible column.</summary>
    public string? TitleColumn {
        get => _titleColumn;
        set {
            CanopyIdentifiers.Require(value, nameof(value), allowNull: true);
            if (value != null && string.IsNullOrWhiteSpace(value)) throw new ArgumentException("A stack title column cannot be blank.", nameof(value));
            _titleColumn = value;
        }
    }

    /// <summary>Gets up to 1,000 layers in processing order. Empty is valid; a nonempty stack has exactly one unfiltered winner.</summary>
    public IList<CanopyStackLayer> Layers { get; } = new List<CanopyStackLayer>();

    internal CanopyColumn ResolveTitleColumn(CanopyDataGridView view) {
        if (TitleColumn != null) {
            foreach (var column in view.Columns) if (column.Id == TitleColumn) return column;
            throw new InvalidOperationException("Stack titleColumn refers to undeclared column '" + TitleColumn + "'.");
        }
        foreach (var column in view.Columns) if (column.RowHeader) return column;
        foreach (var column in view.Columns) if (!column.Hidden) return column;
        throw new InvalidOperationException("A stack needs a title column, a row-header column or a visible column.");
    }

    internal void Validate(CanopyDataGridView view) {
        if (view.Source.Kind != CanopyGridSourceKind.Inline) throw new InvalidOperationException("A stack requires inline grid records.");
        if (view.RowIdentity != CanopyGridRowIdentity.StableKey) throw new InvalidOperationException("A stack requires stable record identities.");
        if (Layers.Count > 1000) throw new InvalidOperationException("A stack has at most 1,000 layers.");
        ResolveTitleColumn(view);
        var records = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in view.Rows) if (row != null) records.Add(row.Id);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var winners = 0;
        foreach (var layer in Layers) {
            if (layer == null) throw new InvalidOperationException("A stack cannot contain a null layer.");
            if (!ids.Add(layer.Id)) throw new InvalidOperationException("Stack layer ids must be unique.");
            if (!records.Contains(layer.Record)) throw new InvalidOperationException("Stack layer refers to unknown record '" + layer.Record + "'.");
            if (layer.Winner && layer.Filtered) throw new InvalidOperationException("A filtered stack layer cannot be the winner.");
            if (layer.Winner) winners++;
            foreach (var badge in layer.Badges) if (badge == null) throw new InvalidOperationException("A stack layer cannot contain a null badge.");
        }
        if (Layers.Count > 0 && winners != 1) throw new InvalidOperationException("A nonempty stack requires exactly one winner supplied by the host.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().OptionalProperty("titleColumn", TitleColumn).Name("layers").BeginArray();
        foreach (var layer in Layers) layer.WriteJson(writer);
        writer.EndArray().EndObject();
    }
}
