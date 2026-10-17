using CanopyX.Json;

namespace CanopyX;

/// <summary>Per-control switches for a tree grid's toolbar, the same controls a flat grid has.</summary>
/// <remarks>
/// Every control is on by default. A control switched off is not built, so no hidden element, focus stop or listener of
/// it stays in the page; the matching API methods (for example <c>saveView</c> or <c>exportAs</c>) stay available to
/// hosts. The search box keeps its own switch, <see cref="CanopyTreeView.Search"/>, and the filter switches theirs,
/// <see cref="CanopyFilter.Hidden"/>. JavaScript hosts can override any switch at runtime with the <c>toolbar</c> option of
/// <c>createTreeGrid</c> or <c>configure</c>, which also accepts <c>search</c>; <c>toolbar: false</c> hides the toolbar.
/// </remarks>
public sealed class CanopyTreeToolbar {
    /// <summary>Gets or sets whether the view's filter switches are shown. A host that draws its own controls turns them off.</summary>
    public bool Filters { get; set; } = true;

    /// <summary>Gets or sets whether the Columns menu is built: show, hide and reorder columns; the tree column stays first.</summary>
    public bool Columns { get; set; } = true;

    /// <summary>Gets or sets whether the Views menu (named views and Reset view) is built. It needs <see cref="CanopyTreeView.StateKey"/>.</summary>
    public bool Views { get; set; } = true;

    /// <summary>Gets or sets whether the Export menu is built: visible, selected or all rows as CSV or a registered export format.</summary>
    public bool Export { get; set; } = true;

    /// <summary>Gets or sets whether the more menu is built: host actions and print.</summary>
    public bool More { get; set; } = true;

    /// <summary>Gets or sets whether the match navigator (count, Previous and Next) and the Highlight matches switch are built when the view declares search highlighting.</summary>
    public bool Matches { get; set; } = true;

    /// <summary>Gets or sets whether the Layout menu is built when the view declares layout modes.</summary>
    public bool Layout { get; set; } = true;

    internal bool IsDefault => Filters && Columns && Views && Export && More && Matches && Layout;

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (!Filters) writer.Property("filters", false);
        if (!Columns) writer.Property("columns", false);
        if (!Views) writer.Property("views", false);
        if (!Export) writer.Property("export", false);
        if (!More) writer.Property("more", false);
        if (!Matches) writer.Property("matches", false);
        if (!Layout) writer.Property("layout", false);
        writer.EndObject();
    }
}
