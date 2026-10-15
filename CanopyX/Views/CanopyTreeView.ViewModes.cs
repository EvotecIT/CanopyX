using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyTreeView {
    /// <summary>Gets or sets search-hit highlighting: the search box's words are marked in the tree column of the visible rows, with
    /// a match count and next/previous navigation. Null, the default, leaves matches unmarked.</summary>
    public CanopySearchHighlight? SearchHighlight { get; set; }

    /// <summary>Gets or sets the layout modes (<see cref="CanopyLayoutMode.Fit"/> and <see cref="CanopyLayoutMode.Scroll"/>) and
    /// densities the reader can choose from a Layout menu. Null, the default, keeps the fit layout without a menu.</summary>
    public CanopyLayoutOptions? Layout { get; set; }

    internal void ValidateViewModes() {
        SearchHighlight?.Validate(Columns);
        Layout?.Validate(tree: true);
    }

    private void WriteViewModesJson(CanopyJsonWriter writer) {
        if (SearchHighlight != null) { writer.Name("searchHighlight"); SearchHighlight.WriteJson(writer); }
        if (Layout != null) { writer.Name("layout"); Layout.WriteJson(writer); }
    }
}
