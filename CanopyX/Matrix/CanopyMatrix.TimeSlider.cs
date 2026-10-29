namespace CanopyX;

public sealed partial class CanopyMatrix {
    /// <summary>Gets or sets optional host-provided snapshots to replay. Null shows the ordinary matrix.</summary>
    /// <remarks>Every frame is a complete matrix with this matrix's id and no nested slider. Static output shows the initial frame.</remarks>
    public CanopyTimeSlider<CanopyMatrix>? TimeSlider { get; set; }
}
