using System.Text.Json;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>
/// The runtime ships minified, so its local names are short. Checks of where code lives (an entry point or a lazy part)
/// read the same sources before minification: comment lines removed and spacing compressed, as the shipped script was.
/// </summary>
internal static class ReadableAssets {
    /// <summary>
    /// An entry point as Build/Sync-Assets.ps1 assembles it before minification: its source scripts, the folding table, the
    /// manifest of the parts it knows and the shared-token defaults.
    /// </summary>
    internal static string Script(CanopyRuntime runtime) {
        var script = Readable(RuntimeAssetTests.EntryScriptFiles(runtime).Select(File.ReadAllText));
        const string folding = "__CANOPYX_FOLD_PAIRS__", parts = "__CX_PARTS__";
        Assert.Equal(runtime != CanopyRuntime.Ui, script.Contains("const EXTRA_FOLD_PAIRS=\"" + folding + "\";", StringComparison.Ordinal));
        if (runtime != CanopyRuntime.Ui) script = script.Replace(folding, RuntimeAssetTests.ShippedFoldingTable(CanopyHtmlAssets.GetScript(runtime)));
        // The entry point reads the manifest of the parts it knows: name -> [version, hashed script, hashed stylesheet].
        Assert.Contains(parts, script);
        return script.Replace(parts, "{" + string.Join(",", CanopyHtmlAssets.GetParts(runtime).Select(part => "\"" + part.Name + "\":[" +
            string.Join(",", new[] { part.Version, part.HashedScriptFileName, part.HashedStyleFileName }.Where(value => value != null).Select(value => "\"" + value + "\"")) + "]")) + "}");
    }

    /// <summary>A lazy part's scripts and its start and end code from Build/parts.json, before minification.</summary>
    internal static string Part(string name) {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(RepositoryPaths.Root, "Build", "parts.json")));
        var part = document.RootElement.GetProperty("parts").EnumerateArray().Single(item => item.GetProperty("name").GetString() == name);
        string? Code(string key) => part.TryGetProperty(key, out var value) ? value.GetString() : null;
        return Readable(new[] { Code("start") }.Concat(PartManifestFile.Scripts(name).Select(File.ReadAllText)).Append(Code("end")).Where(code => code != null)!);
    }

    private static string Readable(IEnumerable<string> sources) => RuntimeAssetTests.CompressScriptSpacing(SharedTokenAssets.Expand(
        RuntimeAssetTests.WithoutCommentLines(string.Join("\n", sources.Select(source => source.Replace("\r\n", "\n").Replace("\r", "\n").TrimEnd('\n'))) + "\n")));
}
