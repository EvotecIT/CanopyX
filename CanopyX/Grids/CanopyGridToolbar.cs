using CanopyX.Json;

namespace CanopyX;

/// <summary>Per-control switches for a flat grid's toolbar.</summary>
/// <remarks>
/// Every control is on by default. A control switched off is removed: it is not built, or is taken out before the grid
/// appears, so no hidden element, focus stop or listener of it stays in the page. The matching API methods (for example
/// <c>saveView</c> or <c>toCsv</c>) stay available to hosts.
/// The search box keeps its own switch, <see cref="CanopyDataGridView.Search"/>. JavaScript hosts can override any switch at
/// runtime with the <c>toolbar</c> option of <c>createDataGrid</c>, which also accepts <c>search</c>.
/// </remarks>
public sealed class CanopyGridToolbar {
    /// <summary>Gets or sets whether the Filters menu is built. Header filters are a separate reporting option and keep working without it.</summary>
    public bool Filters { get; set; } = true;

    /// <summary>Gets or sets whether the Columns menu is built.</summary>
    public bool Columns { get; set; } = true;

    /// <summary>Gets or sets whether the saved Views menu, with its Reset view command, is built.</summary>
    public bool Views { get; set; } = true;

    /// <summary>Gets or sets whether the Export menu is built.</summary>
    public bool Export { get; set; } = true;

    /// <summary>Gets or sets whether the more menu is built: host actions, record details and print.</summary>
    public bool More { get; set; } = true;

    /// <summary>Gets or sets whether the result count is shown above the grid while a search or filter is active.</summary>
    public bool Count { get; set; } = true;

    /// <summary>
    /// Gets or sets whether each header has its column menu button (sort, filter, pin, fit and hide). Switched off, the
    /// header keeps no room for it when columns are fitted. Sorting by the header keeps working, an active header filter keeps
    /// its button, and readers start filters from the Filters menu.
    /// </summary>
    public bool ColumnMenus { get; set; } = true;

    internal bool IsDefault => Filters && Columns && Views && Export && More && Count && ColumnMenus;

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (!Filters) writer.Property("filters", false);
        if (!Columns) writer.Property("columns", false);
        if (!Views) writer.Property("views", false);
        if (!Export) writer.Property("export", false);
        if (!More) writer.Property("more", false);
        if (!Count) writer.Property("count", false);
        if (!ColumnMenus) writer.Property("columnMenus", false);
        writer.EndObject();
    }
}
