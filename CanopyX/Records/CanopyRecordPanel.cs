using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The record panel of a grid or tree: the drawer that shows one record with many more fields than its row, in tabs and
/// collapsible sections under a pinned summary, with structured values, collections, related records, timelines, record
/// deep links and record actions. docs/record-panel.md describes it.
/// </summary>
/// <remarks>
/// <para>
/// The panel shows the view's columns (except those with <see cref="CanopyColumn.ShowInDrawer"/> false; the identity column titles
/// the drawer) and the record-only <see cref="Fields"/>, whose values rows carry in <see cref="CanopyGridRow.Fields"/> (nodes in
/// <see cref="CanopyNode.Fields"/>) or a <see cref="Source"/> loads when the drawer opens. Record fields never join queries, search,
/// sorting, column menus, exports or saved views.
/// </para>
/// <para>
/// Without <see cref="Sections"/>, fields group by their section label as in the plain drawer. Declared sections take the fields
/// they list; a trailing section keeps every other field, and sections no <see cref="Tabs">tab</see> lists join the last tab.
/// </para>
/// </remarks>
public sealed class CanopyRecordPanel {
    private static readonly Regex LinkKey = new Regex("^[A-Za-z][\\w.-]{0,31}$", RegexOptions.CultureInvariant);
    private string? _deepLinkKey;
    private CanopyRecordSource _source = CanopyRecordSource.Inline();

    /// <summary>Gets the record-only fields: titles, kinds, presenters and section labels of values that are not grid columns.</summary>
    /// <remarks>Field ids must differ from the view's column ids. Columns of a tree's or a grid's record fields are never written as
    /// grid columns; only <see cref="CanopyColumn.Id"/>, <see cref="CanopyColumn.Title"/>, <see cref="CanopyColumn.Kind"/>,
    /// <see cref="CanopyColumn.Presenter"/>, <see cref="CanopyColumn.Section"/> and <see cref="CanopyColumn.Wrap"/> apply.</remarks>
    public IList<CanopyColumn> Fields { get; } = new List<CanopyColumn>();

    /// <summary>Gets the sections, in order.</summary>
    public IList<CanopyRecordSection> Sections { get; } = new List<CanopyRecordSection>();

    /// <summary>Gets the tabs, in order. One tab or none shows the sections without a tab bar.</summary>
    public IList<CanopyRecordTab> Tabs { get; } = new List<CanopyRecordTab>();

    /// <summary>Gets or sets the field (column or record field) whose value the pinned summary shows first, usually a status.</summary>
    public string? HeaderStatus { get; set; }

    /// <summary>Gets the up to six fields the pinned summary shows as key facts under the title.</summary>
    /// <remarks>Fields shown in the summary are not repeated in a trailing section.</remarks>
    public IList<string> HeaderFacts { get; } = new List<string>();

    /// <summary>Gets or sets whether empty fields hide until the reader shows them. Default true; the reader's switch is remembered for the page.</summary>
    public bool HideEmpty { get; set; } = true;

    /// <summary>Gets or sets whether a tab shows a jump list of its sections. Null shows it from four sections.</summary>
    public bool? JumpList { get; set; }

    /// <summary>Gets or sets whether the open record is written to the address (<c>#record=&lt;view&gt;:&lt;id&gt;</c>) and opened from it.</summary>
    /// <remarks>Opening a page with such an address opens the grid at that record with its drawer open, also offline from a single file.</remarks>
    public bool DeepLink { get; set; }

    /// <summary>Gets or sets the address parameter of record deep links. Null uses <c>record</c>.</summary>
    /// <exception cref="ArgumentException">The key is not 1 to 32 letters, digits, dots, hyphens or underscores starting with a letter.</exception>
    public string? DeepLinkKey {
        get => _deepLinkKey;
        set => _deepLinkKey = value != null && !LinkKey.IsMatch(value) ? throw new ArgumentException("A deep link key is 1 to 32 letters, digits, dots, hyphens or underscores starting with a letter.", nameof(value)) : value;
    }

    /// <summary>Gets or sets where record details load from. Default <see cref="CanopyRecordSource.Inline"/>.</summary>
    public CanopyRecordSource Source { get => _source; set => _source = value ?? throw new ArgumentNullException(nameof(value)); }

    /// <summary>Gets or sets the built-in actions of the actions menu. Default <see cref="CanopyRecordActions.All"/>.</summary>
    public CanopyRecordActions Actions { get; set; } = CanopyRecordActions.All;

    /// <summary>Checks the panel against the view's columns; returns the ids of the record fields.</summary>
    internal HashSet<string> Validate(IEnumerable<CanopyColumn> columns) {
        var all = new HashSet<string>(StringComparer.Ordinal); var fields = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in columns) all.Add(column.Id);
        foreach (var field in Fields) {
            if (field == null || field.Id == "__proto__" || !all.Add(field.Id) || !fields.Add(field.Id)) throw new InvalidOperationException("Record field ids must be unique, differ from the view's column ids and not be __proto__.");
            CanopyJsonNames.ColumnKind(field.Kind);
            if (field.Section != null && (string.IsNullOrWhiteSpace(field.Section) || field.Section.Length > 256)) throw new InvalidOperationException("A record field's section label has 1 to 256 visible characters.");
            field.Presenter?.Validate(field, new List<CanopyColumn>(columns) { field });
        }
        var sections = new HashSet<string>(StringComparer.Ordinal);
        foreach (var section in Sections) (section ?? throw new InvalidOperationException("A record panel cannot contain a null section.")).Validate(sections, all, 0);
        var tabs = new HashSet<string>(StringComparer.Ordinal);
        foreach (var tab in Tabs) {
            if (tab == null || !tabs.Add(tab.Id)) throw new InvalidOperationException("Record tab ids must be unique.");
            foreach (var id in tab.Sections) {
                var top = false;
                foreach (var section in Sections) top |= section.Id == id;
                if (!top) throw new InvalidOperationException("Record tab '" + tab.Id + "' lists a section that is not a top-level section: " + id + ".");
            }
        }
        if (HeaderFacts.Count > 6) throw new InvalidOperationException("The record summary shows at most six facts.");
        foreach (var id in HeaderFacts) if (id == null || !all.Contains(id)) throw new InvalidOperationException("A record summary fact names an undeclared field: " + id + ".");
        if (HeaderStatus != null && !all.Contains(HeaderStatus)) throw new InvalidOperationException("The record summary status names an undeclared field: " + HeaderStatus + ".");
        if ((Actions & ~CanopyRecordActions.All) != 0) throw new ArgumentOutOfRangeException(nameof(Actions), Actions, "Unknown record actions.");
        return fields;
    }

    internal void WriteJson(CanopyJsonWriter writer, bool grid) {
        writer.BeginObject();
        if (Fields.Count > 0) {
            writer.Name("fields").BeginArray();
            foreach (var field in Fields) {
                writer.BeginObject().Property("id", field.Id).Property("title", field.Title);
                if (field.Kind != CanopyColumnKind.Text) writer.Property("kind", CanopyJsonNames.ColumnKind(field.Kind));
                if (grid && field.Presenter != null) { writer.Name("presenter"); field.Presenter.WriteJson(writer); }
                if (field.Wrap) writer.Property("wrap", true);
                writer.OptionalProperty("section", field.Section).EndObject();
            }
            writer.EndArray();
        }
        if (HeaderStatus != null || HeaderFacts.Count > 0) {
            writer.Name("header").BeginObject().OptionalProperty("status", HeaderStatus);
            if (HeaderFacts.Count > 0) writer.StringArray("facts", HeaderFacts);
            writer.EndObject();
        }
        if (Sections.Count > 0) { writer.Name("sections").BeginArray(); foreach (var section in Sections) section.WriteJson(writer); writer.EndArray(); }
        if (Tabs.Count > 0) { writer.Name("tabs").BeginArray(); foreach (var tab in Tabs) tab.WriteJson(writer); writer.EndArray(); }
        if (!HideEmpty) writer.Property("hideEmpty", false);
        if (JumpList.HasValue) writer.Property("jumpList", JumpList.Value);
        if (DeepLink) {
            writer.Name("deepLink");
            if (_deepLinkKey == null) writer.Boolean(true); else writer.BeginObject().Property("key", _deepLinkKey).EndObject();
        }
        if (_source.Kind != CanopyRecordSourceKind.Inline) { writer.Name("source"); _source.WriteJson(writer); }
        if (Actions != CanopyRecordActions.All) {
            writer.Name("actions").BeginObject();
            foreach (var (flag, name) in new[] { (CanopyRecordActions.Copy, "copy"), (CanopyRecordActions.Print, "print"), (CanopyRecordActions.Export, "export"), (CanopyRecordActions.Link, "link") })
                if ((Actions & flag) == 0) writer.Property(name, false);
            writer.EndObject();
        }
        writer.EndObject();
    }
}
