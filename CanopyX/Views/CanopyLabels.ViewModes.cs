namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the more-menu switch that turns search-hit highlighting on and off. Default "Highlight matches".</summary>
    public string MatchesHighlight { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the match count, including <c>{count}</c>. Default "{count} matches".</summary>
    public string MatchesCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the current match's position, including <c>{current}</c> and <c>{count}</c>. Default "{current} of {count}".</summary>
    public string MatchesPosition { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the text shown when nothing matches. Default "No matches".</summary>
    public string MatchesNone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the match count of a grid that has not loaded every row, including <c>{count}</c>. Default "{count} matches in loaded rows".</summary>
    public string MatchesLoaded { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Previous match button's name. Default "Previous match".</summary>
    public string MatchesPrevious { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Next match button's name. Default "Next match".</summary>
    public string MatchesNext { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement of a match, including <c>{current}</c>, <c>{count}</c> and <c>{column}</c>. Default "Match {current} of {count}, {column}".</summary>
    public string MatchesAnnounce { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the Layout menu's name and its group of layouts. Default "Layout".</summary>
    public string LayoutMenu { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the fit layout's name. Default "Fit to width".</summary>
    public string LayoutFit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the scroll layout's name. Default "All columns, scroll sideways".</summary>
    public string LayoutScroll { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the card layout's name. Default "Cards".</summary>
    public string LayoutCards { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the density group's name. Default "Density".</summary>
    public string LayoutDensity { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the compact density's name. Default "Compact".</summary>
    public string LayoutCompact { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the normal density's name. Default "Normal".</summary>
    public string LayoutNormal { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the comfortable density's name. Default "Comfortable".</summary>
    public string LayoutComfortable { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement of a new layout, including <c>{mode}</c> and <c>{density}</c>. Default "Layout: {mode}, {density}".</summary>
    public string LayoutChanged { get => Get(); set => Set(value); }
}
