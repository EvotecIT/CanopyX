using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets search-hit highlighting: marks for quick-search and column-filter matches, a match count and
    /// next/previous navigation. Null, the default, leaves matches unmarked.</summary>
    public CanopySearchHighlight? SearchHighlight { get; set; }

    /// <summary>Gets or sets the layout modes and densities the reader can choose from a Layout menu. Null, the default, keeps the
    /// fit layout and the grid's <see cref="Density"/> without a menu.</summary>
    public CanopyLayoutOptions? Layout { get; set; }

    /// <summary>Gets or sets literal text templates for card column slots. Requires a layout offering cards.
    /// Null keeps the ordinary card presenters.</summary>
    public CanopyCardTemplate? CardTemplate { get; set; }

    /// <summary>Gets or sets whether the header follows page scrolling while an auto-height grid fits all its rows.
    /// Defaults to false. Internally scrolling grids keep their ordinary header.</summary>
    public bool StickyHeader { get; set; }

    private void ValidateViewModes() {
        SearchHighlight?.Validate(Columns);
        Layout?.Validate(tree: false);
        if (CardTemplate != null) {
            if (Layout == null || Layout.Modes.Count > 0 && !Layout.Modes.Contains(CanopyLayoutMode.Cards))
                throw new System.InvalidOperationException("Card templates require a layout offering cards.");
            CardTemplate.Validate(Columns);
        }
    }

    private void WriteViewModesJson(CanopyJsonWriter writer) {
        if (SearchHighlight != null) { writer.Name("searchHighlight"); SearchHighlight.WriteJson(writer); }
        if (Layout != null) { writer.Name("layout"); Layout.WriteJson(writer); }
        if (CardTemplate != null) { writer.Name("cardTemplate"); CardTemplate.WriteJson(writer); }
        if (StickyHeader) writer.Property("stickyHeader", true);
        if (AllowRegexSearch) writer.Property("allowRegexSearch", true);
    }
}
