namespace CanopyX.Data;

/// <summary>An answer that differs from the edited settings (<see cref="CanopyFlowSubmission.Changes"/>), computed by the server from the flow's <see cref="CanopyFlow.Initial"/>.</summary>
public sealed class CanopyFlowChange {
    internal CanopyFlowChange(string fieldId, string? path, object? from, object? to) {
        FieldId = fieldId;
        Path = path;
        From = from;
        To = to;
    }

    /// <summary>Gets the field's id.</summary>
    public string FieldId { get; }

    /// <summary>Gets the field's setting path (<see cref="CanopyFlowField.ConfigPath"/>), or null.</summary>
    public string? Path { get; }

    /// <summary>Gets the edited value, in its canonical form (text, a double, a boolean, a list, or null when empty).</summary>
    public object? From { get; }

    /// <summary>Gets the new value, in its canonical form, or null when empty.</summary>
    public object? To { get; }
}