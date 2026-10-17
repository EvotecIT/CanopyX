namespace CanopyX;

/// <summary>How a view lays out its columns.</summary>
public enum CanopyLayoutMode {
    /// <summary>Columns fit the width: they give way by priority and the hidden fields wait behind "+N" and the record drawer.</summary>
    Fit,
    /// <summary>Every column keeps its own width, the identity column stays pinned and the view scrolls sideways.</summary>
    Scroll,
    /// <summary>Each record is a card of labelled fields under its title, for phones and narrow panels. Flat grids only.</summary>
    Cards
}
