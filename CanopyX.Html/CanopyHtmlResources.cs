using System;
using System.IO;

namespace CanopyX.Html;

/// <summary>Reads the native asset files embedded from <c>CanopyX.Html/Assets</c>.</summary>
internal static class CanopyHtmlResources {
    /// <summary>
    /// Returns an embedded asset with line feeds only. A checkout can hold the files with either line ending, and
    /// the content hash of an asset must not depend on the machine that built the package.
    /// </summary>
    internal static string Read(string name) {
        var resourceName = "CanopyX.Html.Assets." + name;
        using var stream = typeof(CanopyHtmlResources).Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Embedded CanopyX asset was not found: " + resourceName);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd().Replace("\r\n", "\n");
    }
}
