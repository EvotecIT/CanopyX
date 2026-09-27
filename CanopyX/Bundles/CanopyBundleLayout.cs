using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace CanopyX.Bundles;

/// <summary>
/// File references inside a bundle (see "Sidecar" in docs/data-protocol.md). Children pages are named after a hash of
/// the parent id, so file names stay short, safe on case-insensitive file systems, and independent of id characters.
/// </summary>
internal sealed class CanopyBundleLayout : IDisposable {
    internal const string Manifest = "manifest";

    private readonly SHA256 _sha = SHA256.Create();
    private readonly Dictionary<string, string> _ownerOfHash = new Dictionary<string, string>(StringComparer.Ordinal);

    internal static string RootPage(int page) => "r/" + page;

    /// <summary>
    /// The reference of a search shard. The <c>k-</c> prefix keeps a key such as <c>con</c> or <c>nul</c> from becoming a
    /// Windows device name.
    /// </summary>
    internal static string Shard(string key) => "s/k-" + key;

    /// <summary>
    /// The reference of a children page: <c>c/&lt;hh&gt;/&lt;hash&gt;-&lt;n&gt;</c>, where the hash is the first 16 hex
    /// digits of SHA-256 over the UTF-8 id. If another id already took those 16 digits, the full 64 are used.
    /// </summary>
    internal string ChildrenPage(string parentId, int page) => "c/" + HashOf(parentId) + "-" + page;

    private string HashOf(string id) {
        var full = Hex(_sha.ComputeHash(Encoding.UTF8.GetBytes(id)));
        var shortHash = full.Substring(0, 16);
        if (_ownerOfHash.TryGetValue(shortHash, out var owner) && !string.Equals(owner, id, StringComparison.Ordinal)) {
            shortHash = full;
        } else {
            _ownerOfHash[shortHash] = id;
        }

        return shortHash.Substring(0, 2) + "/" + shortHash;
    }

    private static string Hex(byte[] bytes) {
        var builder = new StringBuilder(bytes.Length * 2);
        foreach (var value in bytes) {
            builder.Append(value.ToString("x2", System.Globalization.CultureInfo.InvariantCulture));
        }

        return builder.ToString();
    }

    public void Dispose() => _sha.Dispose();
}
