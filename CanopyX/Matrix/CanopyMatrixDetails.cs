namespace CanopyX;

/// <summary>What clicking a cell or pressing Enter on it does, after the host's <c>canopyx:matrixCell</c> event.</summary>
public enum CanopyMatrixDetails {
    /// <summary>A dialog shows the cell's state, value, text and details unless the host handles the event (the default).</summary>
    Dialog = 0,
    /// <summary>Only the event: the host shows its own details, for example its record drawer.</summary>
    Host
}
