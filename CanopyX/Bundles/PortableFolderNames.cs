using System;

namespace CanopyX.Bundles;

/// <summary>Identifies device names that Windows reserves even when a filename has an extension.</summary>
internal static class PortableFolderNames {
    internal static bool IsDeviceName(string component) {
        var name = component.Split('.')[0].ToUpperInvariant();
        return name == "CON" || name == "PRN" || name == "AUX" || name == "NUL"
            || (name.Length == 4 && (name.StartsWith("COM", StringComparison.Ordinal) || name.StartsWith("LPT", StringComparison.Ordinal))
                && name[3] >= '1' && name[3] <= '9');
    }
}
