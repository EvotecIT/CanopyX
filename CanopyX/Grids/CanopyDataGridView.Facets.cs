using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets a facet panel beside or above the grid: value lists with counts and ranges with histograms that filter
    /// each other. Null, the default, shows none.</summary>
    public CanopyFacetPanel? FacetPanel { get; set; }

    private void ValidateFacetPanel() => FacetPanel?.Validate(this);

    private void WriteFacetPanelJson(CanopyJsonWriter writer) {
        if (FacetPanel != null) { writer.Name("facets"); FacetPanel.WriteJson(writer); }
    }
}
