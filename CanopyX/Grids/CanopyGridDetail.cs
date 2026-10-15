using System;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Expandable detail rows under the records of a reporting grid.</summary>
/// <remarks>
/// A record shows an expander when it has detail content. The content comes, lazily on first expand, from one source:
/// <list type="bullet">
/// <item><see cref="Template"/>: the id of a page <c>&lt;template&gt;</c> whose <c>data-cx-field</c> elements receive the record's cell text;</item>
/// <item><see cref="Renderer"/>: a detail renderer a browser plugin registers;</item>
/// <item><see cref="View"/> or <see cref="TreeView"/>: a nested grid or tree whose inline data is each record's
/// <see cref="CanopyGridRowsDetail"/> or <see cref="CanopyTreeDetail"/> payload;</item>
/// <item>none of these: each record's own table, properties or HTML payload (<see cref="CanopyGridRow.Detail"/>).</item>
/// </list>
/// Browser hosts can also pass a <c>detail</c> option (a render, html, grid, tree or source callback). Exports and print
/// snapshots carry detail payloads under their records unless <see cref="Print"/> is false.
/// </remarks>
public sealed class CanopyGridDetail {
    private static readonly Regex TemplateId = new Regex("^[A-Za-z][\\w:.-]{0,255}$", RegexOptions.CultureInvariant);
    private static readonly Regex RendererName = new Regex("^[a-z][a-z0-9-]{0,31}$", RegexOptions.CultureInvariant);

    /// <summary>Gets or sets the id of a page <c>&lt;template&gt;</c> element the detail rows clone.</summary>
    public string? Template { get; set; }

    /// <summary>Gets or sets the name of a detail renderer that a browser plugin registers in its <c>detailRenderers</c>.</summary>
    public string? Renderer { get; set; }

    /// <summary>Gets or sets a nested grid template. Its rows come from each record's <see cref="CanopyGridRowsDetail"/>.</summary>
    /// <remarks>Leave the template's rows empty; it keeps no remembered state.</remarks>
    public CanopyDataGridView? View { get; set; }

    /// <summary>Gets or sets a nested tree template. Its roots come from each record's <see cref="CanopyTreeDetail"/>.</summary>
    public CanopyTreeView? TreeView { get; set; }

    /// <summary>Gets or sets whether print snapshots and exports include detail payloads. Default true.</summary>
    public bool Print { get; set; } = true;

    /// <summary>Gets or sets an optional plain-text description of the detail content, at most 256 characters.</summary>
    public string? Label { get; set; }

    internal void Validate() {
        var sources = (Template != null ? 1 : 0) + (Renderer != null ? 1 : 0) + (View != null ? 1 : 0) + (TreeView != null ? 1 : 0);
        if (sources > 1) throw new InvalidOperationException("A detail definition uses one of Template, Renderer, View or TreeView.");
        if (Template != null && !TemplateId.IsMatch(Template)) throw new InvalidOperationException("A detail template is the id of a page template element.");
        if (Renderer != null && !RendererName.IsMatch(Renderer)) throw new InvalidOperationException("A detail renderer name is 1 to 32 lowercase letters, digits and hyphens.");
        if (Label != null && (string.IsNullOrWhiteSpace(Label) || Label.Length > 256)) throw new InvalidOperationException("A detail label has 1 to 256 characters.");
        if (View != null && View.Rows.Count != 0) throw new InvalidOperationException("A nested detail grid takes its rows from each record.");
        View?.Validate();
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().OptionalProperty("template", Template).OptionalProperty("renderer", Renderer);
        if (View != null) writer.Name("view").Raw(View.ToJson());
        if (TreeView != null) writer.Name("view").Raw(TreeView.ToJson());
        if (!Print) writer.Property("print", false);
        writer.OptionalProperty("label", Label).EndObject();
    }
}
