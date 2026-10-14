using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A typed column shared by tree and flat-grid views. The first column of a tree view shows the node label,
/// indent, and expander; flat-grid columns all display cell values.
/// </summary>
public sealed partial class CanopyColumn {
    /// <summary>The narrowest width a column can have, in CSS pixels.</summary>
    public const int MinWidth = 40;

    private CanopyColumnSizing _sizing = CanopyColumnSizing.Content();

    /// <summary>Creates a column.</summary>
    /// <param name="id">The id that node cells use as their key.</param>
    /// <param name="title">The header text.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> or <paramref name="title"/> is null or empty, or the title is whitespace.</exception>
    public CanopyColumn(string id, string title) {
        CanopyIdentifiers.Require(id, nameof(id));

        if (string.IsNullOrWhiteSpace(title)) {
            throw new ArgumentException("Column title is required.", nameof(title));
        }

        Id = id;
        Title = title;
    }

    /// <summary>Gets the id that node cells use as their key.</summary>
    public string Id { get; }

    /// <summary>Gets the header text.</summary>
    public string Title { get; }

    /// <summary>Gets or sets the column's immutable sizing intent. The default fits content; tree widths start at 160 pixels within the bounds.</summary>
    public CanopyColumnSizing Sizing {
        get => _sizing;
        set => _sizing = value ?? throw new ArgumentNullException(nameof(value));
    }

    internal int InitialWidth => Sizing.Width ?? Math.Max(Sizing.Minimum, Math.Min(Sizing.Maximum, 160));

    /// <summary>Gets or sets the deterministic text order for a sortable text grid column. Requires reporting capabilities.</summary>
    public CanopyGridOrdering? Ordering { get; set; }

    /// <summary>Gets or sets how values are formatted, aligned, and sorted.</summary>
    public CanopyColumnKind Kind { get; set; }

    /// <summary>Gets or sets whether the column can sort cell values; tree views sort siblings.</summary>
    public bool Sortable { get; set; }

    /// <summary>Gets or sets whether the interactive runtime offers an editor for this column.</summary>
    /// <remarks>The host edit hook validates and executes proposals. The runtime never changes the node value itself.</remarks>
    public bool Editable { get; set; }

    /// <summary>Gets or sets whether the column starts hidden. Tree views cannot hide their tree column.</summary>
    public bool Hidden { get; set; }

    /// <summary>Gets or sets whether flat-grid cell text wraps within the column. Use automatic grid row heights to show all lines.</summary>
    public bool Wrap { get; set; }

    /// <summary>Gets or sets a safe flat-grid presenter. Raw values still drive search, sort and export.</summary>
    public CanopyGridPresenter? Presenter { get; set; }

    /// <summary>Gets or sets the flat-grid display format of raw numbers in a number column. Cell display text takes precedence.</summary>
    /// <remarks>Summary aggregates and selection totals use the same format. Raw values still drive search, sort and export.</remarks>
    public CanopyGridNumberFormat? Format { get; set; }

    /// <summary>Gets or sets whether selected raw numeric values contribute to the optional status bar.</summary>
    public bool Aggregatable { get; set; }

    /// <summary>Gets or sets the record drawer section label. Null uses the default details section.</summary>
    public string? Section { get; set; }

    internal void WriteJson(CanopyJsonWriter writer, bool grid = false) {
        writer.BeginObject()
            .Property("id", Id)
            .Property("title", Title);
        writer.Property("width", InitialWidth);
        if (Sizing.Minimum != MinWidth) writer.Property("minWidth", Sizing.Minimum);
        if (Sizing.Maximum != int.MaxValue) writer.Property("maxWidth", Sizing.Maximum);
        if (grid && !Sizing.Width.HasValue) writer.Property("autoWidth", true);
        writer.Property("kind", CanopyJsonNames.ColumnKind(Kind));
        if (Sortable) {
            writer.Property("sortable", true);
        }
        if (Editable) writer.Property("editable", true);
        if (Wrap) writer.Property("wrap", true);
        if (grid && Format != null) { writer.Name("format"); Format.WriteJson(writer); }
        if (grid && Presenter != null) { writer.Name("presenter"); Presenter.WriteJson(writer); }
        if (grid && Aggregatable) writer.Property("aggregatable", true);
        if (grid) WriteLayoutJson(writer);
        if (grid) writer.OptionalProperty("section", Section);

        if (Hidden) {
            writer.Property("hidden", true);
        }

        writer.EndObject();
    }
}
