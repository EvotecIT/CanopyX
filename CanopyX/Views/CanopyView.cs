using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Definition of a tree view: columns, layout, selection, search, filters, icons, and the data source. For inline
/// sources the view also carries the nodes.
/// </summary>
/// <remarks>
/// <see cref="ToJson()"/> writes the <c>view</c> document of the <c>canopyx/2</c> protocol. <c>CanopyX.Html</c> embeds
/// that document in a page, and the browser runtime mounts a tree grid from it.
/// </remarks>
public sealed class CanopyView {
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    private int _rowHeight = 28;
    private int _pageSize = 100;
    private CanopySource _source = CanopySource.Inline();
    private CanopyLabels _labels = new CanopyLabels();

    /// <summary>Creates a view.</summary>
    /// <param name="id">The view id, unique within a page. It scopes element ids, remembered state, and deep links.</param>
    /// <param name="label">The accessible name of the tree grid.</param>
    /// <exception cref="ArgumentException">An argument is null or empty, or the accessible label is whitespace.</exception>
    public CanopyView(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));

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

    /// <summary>
    /// Gets or sets whether the tree column stays in view while the other columns scroll sideways, which keeps rows
    /// identifiable on a narrow screen. A host can change it at run time with the grid's
    /// <c>setTreeColumnPinned</c>, for example below a viewport width of its choosing.
    /// </summary>
    public bool PinTreeColumn { get; set; }

    /// <summary>Gets or sets how many rows can be selected at once.</summary>
    public CanopySelectionMode Selection { get; set; }

    /// <summary>Gets or sets checking independently of row selection. Defaults to no checkboxes.</summary>
    /// <remarks>Checkbox views use the interactive browser runtime supplied by <c>CanopyX.Html</c>.</remarks>
    public CanopyCheckboxMode Checkboxes { get; set; }

    /// <summary>Gets the initial checking intents, including paths to nodes that have not loaded.</summary>
    /// <remarks>Intents require an enabled <see cref="Checkboxes"/> mode. Deeper paths override ancestor intents.</remarks>
    public IList<CanopyCheckIntent> CheckIntents { get; } = new List<CanopyCheckIntent>();

    /// <summary>Gets or sets whether rows offer drag-and-drop proposals. Defaults to false.</summary>
    /// <remarks>The interactive runtime requires a host drop hook. It never moves or writes nodes itself.</remarks>
    public bool DragDrop { get; set; }

    /// <summary>Gets the context actions exposed by the interactive runtime.</summary>
    /// <remarks>Actions require a host action hook, which owns authorization and execution.</remarks>
    public IList<CanopyContextAction> ContextActions { get; } = new List<CanopyContextAction>();

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
    /// Gets or sets the key under which the runtime remembers the view state for the browser session.
    /// The state includes expansion, selection, columns, sorting, declared filters, time zone, focus, and scroll.
    /// <see langword="null"/> (the default) remembers nothing.
    /// </summary>
    public string? StateKey { get; set; }

    /// <summary>
    /// Gets or sets the time zone in which the browser shows date and time columns at first. A host can switch it
    /// at run time with the grid's <c>setTimeZone</c>. Values are always written as UTC, and the static outline,
    /// which has no reader's time zone, always shows UTC. Defaults to <see cref="CanopyTimeZone.Utc"/>.
    /// </summary>
    public CanopyTimeZone TimeZone { get; set; }

    /// <summary>Gets or sets whether selecting a row writes its id path to the URL hash and a hash expands it on load.</summary>
    public bool DeepLink { get; set; }

    /// <summary>
    /// Gets or sets the texts CanopyX writes itself for this view, in the browser and in the static outline. English
    /// by default; set translations once here. Assign one <see cref="CanopyLabels"/> to several views, or
    /// <see cref="CanopyLabels.Clone"/> it, to share them.
    /// </summary>
    /// <exception cref="ArgumentNullException">The value is null.</exception>
    public CanopyLabels Labels {
        get => _labels;
        set => _labels = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>Writes the <c>view</c> document of the <c>canopyx/2</c> protocol.</summary>
    /// <returns>The document as compact, HTML-safe JSON.</returns>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, for example duplicate column ids.</exception>
    public string ToJson() => ToJson(null);

    /// <summary>
    /// Writes the view document with the switches of the named filters left out of the toolbar, as if they were
    /// <see cref="CanopyFilter.Hidden"/>, without changing the view.
    /// </summary>
    /// <param name="hiddenFilterIds">Ids of the view's filters to write as hidden, for a page whose host draws its own control for them; null for none.</param>
    /// <returns>The document as compact, HTML-safe JSON.</returns>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, or an id is not one of its filters.</exception>
    public string ToJson(ICollection<string>? hiddenFilterIds) {
        var writer = new CanopyJsonWriter(4096);
        WriteJson(writer, hiddenFilterIds);
        return writer.ToString();
    }

    /// <summary>
    /// Writes the <c>view</c> document of the <c>canopyx/2</c> protocol to a stream as UTF-8 without a byte order mark:
    /// the same bytes as <see cref="Encoding.UTF8"/> gives for <see cref="ToJson()"/>, written in pieces, so the
    /// document of a large tree is never held whole. Use it to hash or store the document.
    /// </summary>
    /// <param name="stream">The stream to write to. It is left open.</param>
    /// <exception cref="ArgumentNullException"><paramref name="stream"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, for example duplicate column ids.</exception>
    public void WriteJson(Stream stream) => WriteJson(stream, null);

    /// <summary>
    /// Writes the view document to a stream as UTF-8 without a byte order mark, with the switches of the named filters
    /// left out of the toolbar: the bytes of <see cref="ToJson(ICollection{string})"/>, written in pieces.
    /// </summary>
    /// <param name="stream">The stream to write to. It is left open.</param>
    /// <param name="hiddenFilterIds">Ids of the view's filters to write as hidden; null for none.</param>
    /// <exception cref="ArgumentNullException"><paramref name="stream"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, or an id is not one of its filters.</exception>
    public void WriteJson(Stream stream, ICollection<string>? hiddenFilterIds) {
        if (stream == null) {
            throw new ArgumentNullException(nameof(stream));
        }

        using var text = new StreamWriter(stream, Utf8, 16 * 1024, leaveOpen: true);
        WriteJson(text, hiddenFilterIds);
    }

    /// <summary>
    /// Writes the <c>view</c> document of the <c>canopyx/2</c> protocol to a text writer: the characters of
    /// <see cref="ToJson()"/>, written in pieces, so the document of a large tree is never held whole.
    /// </summary>
    /// <param name="writer">The writer. It is not flushed or closed.</param>
    /// <exception cref="ArgumentNullException"><paramref name="writer"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, for example duplicate column ids.</exception>
    public void WriteJson(TextWriter writer) => WriteJson(writer, null);

    /// <summary>
    /// Writes the view document to a text writer with the switches of the named filters left out of the toolbar: the
    /// characters of <see cref="ToJson(ICollection{string})"/>, written in pieces.
    /// </summary>
    /// <param name="writer">The writer. It is not flushed or closed.</param>
    /// <param name="hiddenFilterIds">Ids of the view's filters to write as hidden; null for none.</param>
    /// <exception cref="ArgumentNullException"><paramref name="writer"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view breaks a protocol rule, or an id is not one of its filters.</exception>
    public void WriteJson(TextWriter writer, ICollection<string>? hiddenFilterIds) {
        if (writer == null) {
            throw new ArgumentNullException(nameof(writer));
        }

        var json = CanopyJsonWriter.Streaming(writer);
        WriteJson(json, hiddenFilterIds);
        json.Complete();
    }

    internal void WriteJson(CanopyJsonWriter writer, ICollection<string>? hiddenFilterIds = null) {
        CanopyViewValidator.Validate(this);
        if (hiddenFilterIds != null) {
            foreach (var id in hiddenFilterIds) {
                if (!Filters.Any(filter => filter.Id == id)) {
                    throw new InvalidOperationException("View '" + Id + "' declares no filter '" + id + "' to hide.");
                }
            }
        }

        writer.BeginObject().Envelope("view")
            .Property("id", Id)
            .Property("label", Label)
            .Property("rowHeight", _rowHeight)
            .Property("pageSize", _pageSize)
            .Property("selection", CanopyJsonNames.Selection(Selection));
        if (Checkboxes != CanopyCheckboxMode.None) {
            writer.Property("checkboxes", CanopyJsonNames.Checkboxes(Checkboxes));
            if (CheckIntents.Count > 0) {
                writer.Name("checkIntents").BeginArray();
                foreach (var intent in CheckIntents) intent.WriteJson(writer);
                writer.EndArray();
            }
        }
        if (DragDrop) writer.Property("dragDrop", true);
        if (ContextActions.Count > 0) {
            writer.Name("contextActions").BeginArray();
            foreach (var action in ContextActions) action.WriteJson(writer);
            writer.EndArray();
        }
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
                filter.WriteJson(writer, filter.Hidden || (hiddenFilterIds != null && hiddenFilterIds.Contains(filter.Id)));
            }

            writer.EndArray();
        }

        writer.OptionalProperty("timeZone", CanopyJsonNames.TimeZone(TimeZone));
        if (PinTreeColumn) {
            writer.Property("pinTreeColumn", true);
        }

        if (_labels.HasRuntimeLabels) {
            writer.Name("labels");
            _labels.WriteJson(writer);
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
                root.WriteJson(writer);
            }

            writer.EndArray();
        }

        writer.EndObject();
    }
}
