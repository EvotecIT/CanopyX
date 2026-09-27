using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A column of a tree view. The first column of a view is the tree column: it shows the node label, the indent, and
/// the expander.
/// </summary>
public sealed class CanopyColumn {
    /// <summary>The narrowest width a column can have, in CSS pixels.</summary>
    public const int MinWidth = 40;

    private int _width = 160;

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

    /// <summary>Gets or sets the initial width in CSS pixels. Users can resize columns in the browser.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is below <see cref="MinWidth"/>.</exception>
    public int Width {
        get => _width;
        set {
            if (value < MinWidth) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Column width must be at least " + MinWidth + " pixels.");
            }

            _width = value;
        }
    }

    /// <summary>Gets or sets how values are formatted, aligned, and sorted.</summary>
    public CanopyColumnKind Kind { get; set; }

    /// <summary>Gets or sets whether clicking the header sorts siblings by this column's cell values.</summary>
    public bool Sortable { get; set; }

    /// <summary>Gets or sets whether the column starts hidden. The tree column cannot be hidden.</summary>
    public bool Hidden { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject()
            .Property("id", Id)
            .Property("title", Title)
            .Property("width", _width)
            .Property("kind", CanopyJsonNames.ColumnKind(Kind));
        if (Sortable) {
            writer.Property("sortable", true);
        }

        if (Hidden) {
            writer.Property("hidden", true);
        }

        writer.EndObject();
    }
}
