using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace CanopyX.Html;

/// <summary>
/// The browser runtime and theme stylesheet that render CanopyX views, shipped as embedded resources.
/// </summary>
/// <remarks>
/// <para>
/// Hosts that assemble their own pages (for example a report framework) include <see cref="Style"/> and
/// <see cref="Script"/> once per page, or write them as files with <see cref="WriteTo(string)"/> and reference them.
/// The script mounts every CanopyX fragment on the page when it loads.
/// </para>
/// <para>
/// The runtime and the data it reads come from the same build: a page, its runtime, and its sidecar files are written
/// together and published together. Files are therefore named by the hash of their content
/// (<see cref="HashedScriptFileName"/>, <see cref="HashedStyleFileName"/>), so a page written by an older build keeps
/// loading the runtime it was written for, a page written by a newer build never gets an older runtime out of a
/// cache, and the files can be cached without an expiry. A host with an asset pipeline of its own uses the plain
/// names, or takes <see cref="ScriptHash"/> and <see cref="StyleHash"/> for its own naming and cache keys. The names tie a page to its runtime, not to its data: the page and its sidecar files are still published together.
/// </para>
/// </remarks>
public static class CanopyHtmlAssets {
    /// <summary>The plain file name of the runtime script, <c>canopyx.js</c>.</summary>
    public const string ScriptFileName = "canopyx.js";

    /// <summary>The plain file name of the theme stylesheet, <c>canopyx.css</c>.</summary>
    public const string StyleFileName = "canopyx.css";

    private static readonly UTF8Encoding FileEncoding = new UTF8Encoding(false);
    private static readonly Lazy<string> ScriptResource = new Lazy<string>(() => CanopyHtmlResources.Read("canopyx.js"));
    private static readonly Lazy<string> StyleResource = new Lazy<string>(() => CanopyHtmlResources.Read("canopyx.css"));
    private static readonly Lazy<string> ScriptHashValue = new Lazy<string>(() => Hash(ScriptResource.Value));
    private static readonly Lazy<string> StyleHashValue = new Lazy<string>(() => Hash(StyleResource.Value));

    /// <summary>Gets the runtime script.</summary>
    public static string Script => ScriptResource.Value;

    /// <summary>Gets the theme stylesheet.</summary>
    public static string Style => StyleResource.Value;

    /// <summary>
    /// Gets the content hash of the runtime script: the first 16 lowercase hex digits of the SHA-256 of the file as
    /// <see cref="WriteTo(string)"/> writes it (UTF-8 without a byte order mark). Two builds with the same runtime
    /// have the same hash.
    /// </summary>
    public static string ScriptHash => ScriptHashValue.Value;

    /// <summary>Gets the content hash of the theme stylesheet, formed like <see cref="ScriptHash"/>.</summary>
    public static string StyleHash => StyleHashValue.Value;

    /// <summary>Gets the file name of the runtime script with its content hash, <c>canopyx.&lt;hash&gt;.js</c>.</summary>
    public static string HashedScriptFileName => "canopyx." + ScriptHash + ".js";

    /// <summary>Gets the file name of the theme stylesheet with its content hash, <c>canopyx.&lt;hash&gt;.css</c>.</summary>
    public static string HashedStyleFileName => "canopyx." + StyleHash + ".css";

    /// <summary>Returns the file name of the runtime script under a naming.</summary>
    /// <param name="naming">Content-hashed or plain.</param>
    /// <returns><see cref="HashedScriptFileName"/> or <see cref="ScriptFileName"/>.</returns>
    public static string GetScriptFileName(CanopyAssetNaming naming) => naming == CanopyAssetNaming.Plain ? ScriptFileName : HashedScriptFileName;

    /// <summary>Returns the file name of the theme stylesheet under a naming.</summary>
    /// <param name="naming">Content-hashed or plain.</param>
    /// <returns><see cref="HashedStyleFileName"/> or <see cref="StyleFileName"/>.</returns>
    public static string GetStyleFileName(CanopyAssetNaming naming) => naming == CanopyAssetNaming.Plain ? StyleFileName : HashedStyleFileName;

    /// <summary>
    /// Writes the runtime script and the theme stylesheet into a folder under their content-hashed names, creating
    /// the folder when needed. A file that is already there is not rewritten, and files of other builds are left
    /// alone, so pages written earlier keep working and several writers can share one folder. Removing files no page
    /// references any more is the host's job.
    /// </summary>
    /// <param name="directory">The folder, for example the <c>assets</c> folder next to the pages.</param>
    /// <returns>The full paths of the written files: the script, then the stylesheet.</returns>
    /// <exception cref="ArgumentException"><paramref name="directory"/> is null or empty.</exception>
    public static IReadOnlyList<string> WriteTo(string directory) => WriteTo(directory, CanopyAssetNaming.ContentHash);

    /// <summary>Writes the runtime script and the theme stylesheet into a folder, creating it when needed.</summary>
    /// <param name="directory">The folder, for example the <c>assets</c> folder next to the pages.</param>
    /// <param name="naming">
    /// Content-hashed names, or the plain names <c>canopyx.js</c> and <c>canopyx.css</c>. It must be the naming of the
    /// pages that reference the files (<see cref="CanopyHtmlOptions.AssetNaming"/>).
    /// </param>
    /// <returns>The full paths of the written files: the script, then the stylesheet.</returns>
    /// <exception cref="ArgumentException"><paramref name="directory"/> is null or empty.</exception>
    public static IReadOnlyList<string> WriteTo(string directory, CanopyAssetNaming naming) {
        if (string.IsNullOrEmpty(directory)) {
            throw new ArgumentException("Directory is required.", nameof(directory));
        }

        Directory.CreateDirectory(directory);
        var script = Path.GetFullPath(Path.Combine(directory, GetScriptFileName(naming)));
        var style = Path.GetFullPath(Path.Combine(directory, GetStyleFileName(naming)));
        if (naming == CanopyAssetNaming.Plain) {
            File.WriteAllText(script, Script, FileEncoding);
            File.WriteAllText(style, Style, FileEncoding);
        } else {
            WriteOnce(script, FileEncoding.GetBytes(Script));
            WriteOnce(style, FileEncoding.GetBytes(Style));
        }

        return new[] { script, style };
    }

    /// <summary>
    /// Writes a content-hashed file that is never rewritten: a file with that name already has that content, and a
    /// server or a cache may be reading it. A new file appears whole, through a move from a temporary file next to it,
    /// so two writers into one shared folder cannot hand out a truncated copy.
    /// </summary>
    private static void WriteOnce(string path, byte[] content) {
        if (SameContent(path, content)) {
            return;
        }

        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllBytes(temporary, content);
        try {
            if (File.Exists(path)) {
                // A file under this name with other bytes is damaged (or not ours); replace it.
                File.Delete(path);
            }

            File.Move(temporary, path);
        } catch (IOException) when (SameContent(path, content)) {
            // Another writer put the same file in place first.
        } finally {
            if (File.Exists(temporary)) {
                File.Delete(temporary);
            }
        }
    }

    private static bool SameContent(string path, byte[] content) {
        try {
            var info = new FileInfo(path);
            if (!info.Exists || info.Length != content.Length) {
                return false;
            }

            var existing = File.ReadAllBytes(path);
            for (var index = 0; index < existing.Length; index++) {
                if (existing[index] != content[index]) {
                    return false;
                }
            }

            return true;
        } catch (IOException) {
            return false;
        } catch (UnauthorizedAccessException) {
            return false;
        }
    }

    private static string Hash(string content) {
        using (var sha = SHA256.Create()) {
            var hash = sha.ComputeHash(FileEncoding.GetBytes(content));
            var hex = new StringBuilder(16);
            for (var index = 0; index < 8; index++) {
                hex.Append(hash[index].ToString("x2", CultureInfo.InvariantCulture));
            }

            return hex.ToString();
        }
    }
}
