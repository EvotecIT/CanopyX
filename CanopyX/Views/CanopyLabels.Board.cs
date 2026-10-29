namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the board text: Lane</summary>
    public string BoardLane { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: Unassigned</summary>
    public string BoardUnassigned { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: No records in this lane</summary>
    public string BoardEmpty { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: {count} / {limit}</summary>
    public string BoardWip { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: {lane} has reached its work limit ({limit}).</summary>
    public string BoardWipFull { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: Move to lane</summary>
    public string BoardMove { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: {title} moved to {lane}.</summary>
    public string BoardMoved { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: Move was not accepted.</summary>
    public string BoardRejected { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: Waiting for the host to accept the move…</summary>
    public string BoardPending { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: Showing the first {count} records. Narrow the filters to see the rest.</summary>
    public string BoardPartial { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the board text: Use Alt+Left or Alt+Right to move between lanes; Up and Down to browse cards.</summary>
    public string BoardKeys { get => Get(); set => Set(value); }

}
