namespace CanopyX;

/// <summary>
/// Identifies the CanopyX data protocol written into every document.
/// </summary>
/// <remarks>
/// Every document carries <c>"protocol": "canopyx/1"</c>. Optional fields can be added within version 1 and readers
/// ignore fields they do not know; a change that would break an existing reader uses a new version string.
/// </remarks>
public static class CanopyProtocol {
    /// <summary>The protocol identifier, <c>canopyx/1</c>.</summary>
    public const string Version = "canopyx/1";
}
