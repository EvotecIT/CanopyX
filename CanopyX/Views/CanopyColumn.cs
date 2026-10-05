using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A typed column shared by tree and flat-grid views. The first column of a tree view shows the node label,
/// indent, and expander; flat-grid columns all display cell values.
/// </summary>
public sealed class CanopyColumn {
    /// <summary>The narrowest width a column can have, in CSS pixels.</summary>
    public const int MinWidth = 40;

    private int _width = 160;
    internal bool HasExplicitWidth { get; private set; }

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

    /// <summary>Gets or sets the initial width in CSS pixels. Unassigned flat-grid widths fit loaded content; tree widths default to 160. Users can resize columns.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is below <see cref="MinWidth"/>.</exception>
    public int Width {
        get => _width;
        set {
            if (value < MinWidth) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Column width must be at least " + MinWidth + " pixels.");
            }

            _width = value;
            HasExplicitWidth = true;
        }
    }

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

    internal void WriteJson(CanopyJsonWriter writer, bool grid = false, int? width = null) {
        writer.BeginObject()
            .Property("id", Id)
            .Property("title", Title);
        writer.Property("width", width ?? _width);
        if (grid && !HasExplicitWidth) writer.Property("autoWidth", true);
        writer.Property("kind", CanopyJsonNames.ColumnKind(Kind));
        if (Sortable) {
            writer.Property("sortable", true);
        }
        if (Editable) writer.Property("editable", true);
        if (Wrap) writer.Property("wrap", true);

        if (Hidden) {
            writer.Property("hidden", true);
        }

        writer.EndObject();
    }
}
