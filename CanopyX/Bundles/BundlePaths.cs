using System;
using System.Text;

namespace CanopyX.Bundles;

/// <summary>Resolves the portable data folder shared by bundle planning and writing.</summary>
internal static class BundlePaths {
    internal static string DataPath(string id, string? configured) => configured ?? "data/" + SafeFolder(id) + "/";

    internal static string SafeFolder(string id) {
        var builder = new StringBuilder(id.Length);
        foreach (var ch in id) {
            builder.Append((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' ? ch : '_');
        }

        var folder = builder.ToString();
        var reserved = PortableFolderNames.IsDeviceName(folder);
        using (var sha = System.Security.Cryptography.SHA256.Create()) {
            // Hash the exact UTF-16 units, including lone surrogates, without replacement fallback.
            var hash = sha.ComputeHash(BundleIdentity.Bytes(id));
            var suffix = new StringBuilder(64);
            foreach (var value in hash) suffix.Append(value.ToString("x2", System.Globalization.CultureInfo.InvariantCulture));
            return (reserved ? "_" : "") + folder.Substring(0, Math.Min(40, folder.Length)) + "-" + suffix;
        }
    }

}
