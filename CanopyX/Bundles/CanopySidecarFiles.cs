using System;
using System.Globalization;
using System.IO;

namespace CanopyX.Bundles;

/// <summary>Removes obsolete numbered scripts owned by a regenerated row or record sidecar.</summary>
internal static class CanopySidecarFiles {
    internal static void RemoveObsolete(string folder, string prefix, Func<int, bool> retained) {
        foreach (var path in Directory.EnumerateFiles(folder, prefix + "*.js", SearchOption.TopDirectoryOnly)) {
            var name = Path.GetFileNameWithoutExtension(path);
            var number = name.Substring(prefix.Length);
            // Only the canonical file names the writers generate belong to this publication.
            if (!int.TryParse(number, NumberStyles.None, CultureInfo.InvariantCulture, out var index) || index < 0 ||
                number != index.ToString(CultureInfo.InvariantCulture) || retained(index)) continue;
            File.Delete(path);
        }
    }
}
