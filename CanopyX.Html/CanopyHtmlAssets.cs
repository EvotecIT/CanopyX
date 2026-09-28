using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace CanopyX.Html;

/// <summary>
/// The browser runtime and theme stylesheet that render CanopyX views, shipped as embedded resources.
/// </summary>
/// <remarks>
/// Hosts that assemble their own pages (for example a report framework) include <see cref="Style"/> and
/// <see cref="Script"/> once per page, or write them as files with <see cref="WriteTo(string)"/> and reference them.
/// The script mounts every CanopyX fragment on the page when it loads.
/// </remarks>
public static class CanopyHtmlAssets {
    /// <summary>The file name of the runtime script, <c>canopyx.js</c>.</summary>
    public const string ScriptFileName = "canopyx.js";

    /// <summary>The file name of the theme stylesheet, <c>canopyx.css</c>.</summary>
    public const string StyleFileName = "canopyx.css";

    private static readonly Lazy<string> ScriptResource = new Lazy<string>(() => CanopyHtmlResources.Read("canopyx.js"));
    private static readonly Lazy<string> StyleResource = new Lazy<string>(() => CanopyHtmlResources.Read("canopyx.css"));

    /// <summary>Gets the runtime script.</summary>
    public static string Script => ScriptResource.Value;

    /// <summary>Gets the theme stylesheet.</summary>
    public static string Style => StyleResource.Value;

    /// <summary>Writes <c>canopyx.js</c> and <c>canopyx.css</c> into a folder, creating it when needed.</summary>
    /// <param name="directory">The folder, for example the <c>assets</c> folder next to the pages.</param>
    /// <returns>The full paths of the written files.</returns>
    /// <exception cref="ArgumentException"><paramref name="directory"/> is null or empty.</exception>
    public static IReadOnlyList<string> WriteTo(string directory) {
        if (string.IsNullOrEmpty(directory)) {
            throw new ArgumentException("Directory is required.", nameof(directory));
        }

        Directory.CreateDirectory(directory);
        var encoding = new UTF8Encoding(false);
        var script = Path.GetFullPath(Path.Combine(directory, ScriptFileName));
        var style = Path.GetFullPath(Path.Combine(directory, StyleFileName));
        File.WriteAllText(script, Script, encoding);
        File.WriteAllText(style, Style, encoding);
        return new[] { script, style };
    }
}
