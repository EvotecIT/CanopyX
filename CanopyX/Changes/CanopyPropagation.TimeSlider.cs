namespace CanopyX;

public sealed partial class CanopyPropagation {
    /// <summary>Gets or sets optional host-provided snapshots to replay. Null shows the ordinary propagation view.</summary>
    /// <remarks>Every frame is a complete propagation view with this view's id and no nested slider. Static output shows the initial frame.</remarks>
    public CanopyTimeSlider<CanopyPropagation>? TimeSlider { get; set; }
}
