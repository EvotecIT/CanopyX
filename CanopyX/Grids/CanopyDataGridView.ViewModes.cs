using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets search-hit highlighting: marks for quick-search and column-filter matches, a match count and
    /// next/previous navigation. Null, the default, leaves matches unmarked.</summary>
    public CanopySearchHighlight? SearchHighlight { get; set; }

    /// <summary>Gets or sets the layout modes and densities the reader can choose from a Layout menu. Null, the default, keeps the
    /// fit layout and the grid's <see cref="Density"/> without a menu.</summary>
    public CanopyLayoutOptions? Layout { get; set; }

    private void ValidateViewModes() {
        SearchHighlight?.Validate(Columns);
        Layout?.Validate(tree: false);
    }

    private void WriteViewModesJson(CanopyJsonWriter writer) {
        if (SearchHighlight != null) { writer.Name("searchHighlight"); SearchHighlight.WriteJson(writer); }
        if (Layout != null) { writer.Name("layout"); Layout.WriteJson(writer); }
    }
}
