namespace CanopyX.Html.Ui;

/// <summary>Typed declarative accordion options. Runtime callbacks are registered by the host in JavaScript.</summary>
public sealed class CanopyAccordionOptions {
    /// <summary>Gets or sets whether several sections can be open together. By default opening a section closes the open one.</summary>
    public bool Multiple { get; set; }
    /// <summary>Gets or sets the visual treatment.</summary>
    public CanopyAccordionStyle Style { get; set; }
    /// <summary>Gets or sets the mark that shows whether a section is open.</summary>
    public CanopyAccordionIndicator Indicator { get; set; }
    /// <summary>Gets or sets the side of the heading that holds the indicator.</summary>
    public CanopyAccordionIndicatorPosition IndicatorPosition { get; set; }
    /// <summary>Gets or sets the level of the section headings, 2 to 6, which fits them into the page's outline.</summary>
    public int HeadingLevel { get; set; } = 3;
    /// <summary>Gets or sets whether sections slide open. Readers who prefer reduced motion never see the animation.</summary>
    public bool Animate { get; set; }
    /// <summary>Gets or sets whether the open sections are written to the address, so links and reloads restore them.</summary>
    public bool Hash { get; set; }
    /// <summary>Gets or sets the browser storage key that remembers open sections across visits. Null remembers nothing.</summary>
    public string? RememberKey { get; set; }
    /// <summary>Gets or sets whether a filter box above the sections matches their headings.</summary>
    public bool Search { get; set; }
    /// <summary>Gets or sets the filter box placeholder. Null uses the localized label.</summary>
    public string? SearchPlaceholder { get; set; }
    /// <summary>Gets or sets the filter delay after typing, in milliseconds. Null uses the runtime default of 150.</summary>
    public int? SearchDebounce { get; set; }
    /// <summary>Gets or sets whether each section has a button that copies its title. A section's own setting wins.</summary>
    public bool CopyTitle { get; set; }
    /// <summary>Gets or sets whether all sections print, rather than only the open ones.</summary>
    public bool PrintAll { get; set; } = true;
    /// <summary>Gets or sets the product styling variant emitted as an encoded attribute.</summary>
    public string? Variant { get; set; }
}
