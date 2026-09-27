using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Definition of a tree view: columns, layout, selection, search, filters, icons, and the data source. For inline
/// sources the view also carries the nodes.
/// </summary>
/// <remarks>
/// <see cref="ToJson"/> writes the <c>view</c> document of the <c>canopyx/1</c> protocol. <c>CanopyX.Html</c> embeds
/// that document in a page, and the browser runtime mounts a tree grid from it.
/// </remarks>
public sealed class CanopyView {
    private int _rowHeight = 28;
    private int _pageSize = 100;
    private CanopySource _source = CanopySource.Inline();

    /// <summary>Creates a view.</summary>
    /// <param name="id">The view id, unique within a page. It scopes element ids, remembered state, and deep links.</param>
    /// <param name="label">The accessible name of the tree grid.</param>
    /// <exception cref="ArgumentException">An argument is null or empty, or the accessible label is whitespace.</exception>
    public CanopyView(string id, string label) {
        if (string.IsNullOrEmpty(id)) {
            throw new ArgumentException("View id is required.", nameof(id));
        }

        if (string.IsNullOrWhiteSpace(label)) {
            throw new ArgumentException("View label is required.", nameof(label));
        }

        Id = id;
        Label = label;
    }

    /// <summary>Gets the view id.</summary>
    public string Id { get; }

    /// <summary>Gets the accessible name of the tree grid.</summary>
    public string Label { get; }

    /// <summary>Gets the columns. The first column is the tree column.</summary>
    public IList<CanopyColumn> Columns { get; } = new List<CanopyColumn>();

    /// <summary>Gets the top-level nodes. They are written into the view only for inline sources.</summary>
    public IList<CanopyNode> Roots { get; } = new List<CanopyNode>();

    /// <summary>Gets or sets the row height in CSS pixels, from 20 to 64. Every row has the same height.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 20 to 64.</exception>
    public int RowHeight {
        get => _rowHeight;
        set {
            if (value < 20 || value > 64) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Row height must be between 20 and 64 pixels.");
            }

            _rowHeight = value;
        }
    }

    /// <summary>
    /// Gets or sets how many children an inline source shows before a "show more" row. Sidecar and remote sources
    /// use the page size their data was written or served with.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 10,000.</exception>
    public int PageSize {
        get => _pageSize;
        set {
            if (value < 1 || value > 10000) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Page size must be between 1 and 10,000.");
            }

            _pageSize = value;
        }
    }

    /// <summary>Gets or sets how many rows can be selected at once.</summary>
    public CanopySelectionMode Selection { get; set; }

    /// <summary>Gets or sets where the runtime reads nodes from. Defaults to <see cref="CanopySource.Inline"/>.</summary>
    /// <exception cref="ArgumentNullException">The value is null.</exception>
    public CanopySource Source {
        get => _source;
        set => _source = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>Gets or sets the search box options. <see langword="null"/> (the default) shows no search box.</summary>
    public CanopySearchOptions? Search { get; set; }

    /// <summary>Gets the "only matching" switches shown in the toolbar.</summary>
    public IList<CanopyFilter> Filters { get; } = new List<CanopyFilter>();

    /// <summary>
    /// Gets the icons nodes can refer to by key, as trusted SVG markup declared once per view. Icons are drawn with
    /// the text colour, so use <c>currentColor</c> in the SVG.
    /// </summary>
    public IDictionary<string, string> Icons { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>
    /// Gets or sets the key under which the runtime remembers expanded paths for the browser session.
    /// <see langword="null"/> (the default) remembers nothing.
    /// </summary>
    public string? StateKey { get; set; }

    /// <summary>Gets or sets whether selecting a row writes its id path to the URL hash and a hash expands it on load.</summary>
    public bool DeepLink { get; set; }

    /// <summary>Writes the <c>view</c> document of the <c>canopyx/1</c> protocol.</summary>
    /// <returns>The document as compact, HTML-safe JSON.</returns>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, for example duplicate column ids.</exception>
    public string ToJson() {
        var writer = new CanopyJsonWriter(4096);
        WriteJson(writer);
        return writer.ToString();
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        CanopyViewValidator.Validate(this);
        writer.BeginObject().Envelope("view")
            .Property("id", Id)
            .Property("label", Label)
            .Property("rowHeight", _rowHeight)
            .Property("pageSize", _pageSize)
            .Property("selection", CanopyJsonNames.Selection(Selection));
        writer.Name("columns").BeginArray();
        foreach (var column in Columns) {
            column.WriteJson(writer);
        }

        writer.EndArray();
        if (Icons.Count > 0) {
            writer.Name("icons").BeginObject();
            foreach (var icon in Icons) {
                writer.Property(icon.Key, icon.Value);
            }

            writer.EndObject();
        }

        if (Search != null) {
            writer.Name("search");
            Search.WriteJson(writer);
        }

        if (Filters.Count > 0) {
            writer.Name("filters").BeginArray();
            foreach (var filter in Filters) {
                filter.WriteJson(writer);
            }

            writer.EndArray();
        }

        writer.OptionalProperty("stateKey", StateKey);
        if (DeepLink) {
            writer.Property("deepLink", true);
        }

        writer.Name("source");
        _source.WriteJson(writer);
        if (_source.Kind == CanopySourceKind.Inline) {
            writer.Name("roots").BeginArray();
            foreach (var root in Roots) {
                root.WriteJson(writer, includeChildren: true);
            }

            writer.EndArray();
        }

        writer.EndObject();
    }
}
