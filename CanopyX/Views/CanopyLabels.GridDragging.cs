namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets what a screen reader hears after F2 picks up a row of a grid with <see cref="CanopyDataGridView.DragRows"/>, including <c>{title}</c>. Default "Picked up {title}. Move to a calendar and press Enter to drop it.".</summary>
    public string GridRowPicked { get => Get(); set => Set(value); }
}