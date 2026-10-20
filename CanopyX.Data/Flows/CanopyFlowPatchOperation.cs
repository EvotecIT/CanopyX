namespace CanopyX.Data;

/// <summary>One JSON Patch operation of a proposal (<see cref="CanopyFlowSubmission.Patch"/>), built by the server from the fields' setting paths.</summary>
public sealed class CanopyFlowPatchOperation {
    internal CanopyFlowPatchOperation(string op, string path, object? value) {
        Op = op;
        Path = path;
        Value = value;
    }

    /// <summary>Gets the operation: <c>add</c>, <c>replace</c> or <c>remove</c>.</summary>
    public string Op { get; }

    /// <summary>Gets the JSON Pointer of the setting, for example <c>/mail/host</c>.</summary>
    public string Path { get; }

    /// <summary>Gets the value an add or replace writes, in its canonical form; null for remove.</summary>
    public object? Value { get; }
}