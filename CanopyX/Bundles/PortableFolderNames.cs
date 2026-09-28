using System;

namespace CanopyX.Bundles;

/// <summary>Checks portable, URL-safe folder components.</summary>
internal static class PortableFolderNames {
    internal static bool IsPortableComponent(string component) {
        if (component.Length == 0 || component.Length > 255 || component.EndsWith(".", StringComparison.Ordinal) || IsDeviceName(component)) return false;
        foreach (var ch in component) {
            if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.')) return false;
        }
        return true;
    }

    internal static bool IsDeviceName(string component) {
        var name = component.Split('.')[0].ToUpperInvariant();
        return name == "CON" || name == "PRN" || name == "AUX" || name == "NUL"
            || (name.Length == 4 && (name.StartsWith("COM", StringComparison.Ordinal) || name.StartsWith("LPT", StringComparison.Ordinal))
                && name[3] >= '1' && name[3] <= '9');
    }
}
