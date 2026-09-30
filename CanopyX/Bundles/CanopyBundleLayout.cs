using System.Globalization;

namespace CanopyX.Bundles;

/// <summary>File references inside a bundle (see "Sidecar" in docs/data-protocol.md).</summary>
internal static class CanopyBundleLayout {
    internal const string Manifest = "manifest";

    internal static string RootPage(int page) => "r/" + page.ToString(CultureInfo.InvariantCulture);

    /// <summary>The reference of a search entry file.</summary>
    internal static string EntryFile(int number) => "e/" + number.ToString(CultureInfo.InvariantCulture);

    /// <summary>
    /// The reference of a search shard. The <c>k-</c> prefix keeps a key such as <c>con</c> or <c>nul</c> from becoming a
    /// Windows device name.
    /// </summary>
    internal static string Shard(string key) => "s/k-" + key;

    /// <summary>The reference of a pack file, which holds the children pages of many nodes.</summary>
    internal static string Pack(int number) => "p/" + number.ToString(CultureInfo.InvariantCulture);

    /// <summary>The reference of one children page: its pack file and its position among that file's pages.</summary>
    internal static string PackedPage(int pack, int slot) => Pack(pack) + "#" + slot.ToString(CultureInfo.InvariantCulture);
}
