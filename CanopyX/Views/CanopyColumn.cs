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

    /// <summary>Gets or sets the column's immutable sizing intent. The default fits content in flat grids and trees; trees write 160 pixels, within the bounds, as the width a tree uses until its columns are measured.</summary>
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

    /// <summary>Gets or sets whether readers can edit this column.</summary>
    /// <remarks>
    /// <para>
    /// In a tree view the interactive runtime offers an editor that raises one edit proposal per change; the host edit hook
    /// validates and executes it, and the runtime never changes the node value itself.
    /// </para>
    /// <para>
    /// In a flat grid the editing part offers the column's typed <see cref="Editor"/> with its <see cref="Validation"/>. Edits
    /// stay in the grid's change set (marked and undoable) until a row or batch commit hands them to the host, which saves them
    /// and confirms each row. See docs/editing.md.
    /// </para>
    /// </remarks>
    public bool Editable { get; set; }

    /// <summary>Gets or sets whether the column starts hidden. Tree views cannot hide their tree column.</summary>
    public bool Hidden { get; set; }

    /// <summary>Gets or sets whether flat-grid cell text wraps within the column. Use automatic grid row heights to show all lines.</summary>
    public bool Wrap { get; set; }

    /// <summary>Gets or sets a safe flat-grid presenter. Raw values still drive search, sort and export.</summary>
    public CanopyGridPresenter? Presenter { get; set; }

    /// <summary>Gets or sets whether selected raw numeric values contribute to the optional status bar.</summary>
    public bool Aggregatable { get; set; }

    /// <summary>Gets or sets the record drawer section label. Null uses the default details section.</summary>
    public string? Section { get; set; }

    /// <summary>
    /// Gets or sets the name of a cell renderer a browser plugin registers (<c>cellRenderers</c> in docs/plugins.md), which
    /// draws this column's cells in trees and flat grids. Null, or a name no plugin on the page registers, keeps the built-in
    /// painter; a host's own renderer for the column wins. The static fallback and exports keep the cell text.
    /// </summary>
    /// <exception cref="ArgumentException">The name is not 1 to 64 ASCII letters, digits, hyphens or underscores starting with a letter.</exception>
    public string? Renderer {
        get => _renderer;
        set {
            if (value != null && !IsRendererName(value)) throw new ArgumentException("A renderer name is 1 to 64 ASCII letters, digits, hyphens or underscores starting with a letter.", nameof(value));
            _renderer = value;
        }
    }

    private string? _renderer;

    private static bool IsRendererName(string value) {
        if (value.Length == 0 || value.Length > 64 || !((value[0] >= 'a' && value[0] <= 'z') || (value[0] >= 'A' && value[0] <= 'Z'))) return false;
        foreach (var ch in value) {
            if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_')) return false;
        }
        return true;
    }

    internal void WriteJson(CanopyJsonWriter writer, bool grid = false) {
        writer.BeginObject()
            .Property("id", Id)
            .Property("title", Title);
        writer.Property("width", InitialWidth);
        if (Sizing.Minimum != MinWidth) writer.Property("minWidth", Sizing.Minimum);
        if (Sizing.Maximum != int.MaxValue) writer.Property("maxWidth", Sizing.Maximum);
        if (!Sizing.Width.HasValue) writer.Property("autoWidth", true);
        writer.Property("kind", CanopyJsonNames.ColumnKind(Kind));
        if (Sortable) {
            writer.Property("sortable", true);
        }
        if (Editable) writer.Property("editable", true);
        if (grid && Editor != null) { writer.Name("editor"); Editor.WriteJson(writer); }
        if (grid && Validation != null) { writer.Name("validation"); Validation.WriteJson(writer); }
        if (Wrap) writer.Property("wrap", true);
        if (grid && Presenter != null) { writer.Name("presenter"); Presenter.WriteJson(writer); }
        if (grid && Aggregatable) writer.Property("aggregatable", true);
        WriteLayoutJson(writer, grid);
        if (grid) writer.OptionalProperty("section", Section);
        writer.OptionalProperty("renderer", Renderer);

        if (Hidden) {
            writer.Property("hidden", true);
        }

        writer.EndObject();
    }
}
