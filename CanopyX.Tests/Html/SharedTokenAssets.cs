using System.IO.Compression;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>Shared-token assembly expectations and its separately bounded transport allowance.</summary>
internal static class SharedTokenAssets {
    // Use-site defaults let standalone views work without declaring a palette that overrides the host's inherited tokens.
    // The shared defaults and density/theme lifecycle have a separate 6 KiB transport budget; component limits stay intact.
    internal const int Allowance = 6 * 1024;

    private static readonly SortedDictionary<string, string> Fallbacks = new(
        JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(Path.Combine(
            RepositoryPaths.Root, "CanopyX.Html", "Assets", "Shared", "canopyx-fallbacks.json")))!, StringComparer.Ordinal);
    private static readonly JsonSerializerOptions JsonOptions = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    internal static string FallbackJson => JsonSerializer.Serialize(Fallbacks, JsonOptions);

    internal static string StatusFallbackJson => JsonSerializer.Serialize(Fallbacks
        .Where(pair => Regex.IsMatch(pair.Key, @"^--hfx-color-status-.*-(fg|bg)$"))
        .ToDictionary(pair => pair.Key, pair => pair.Value), JsonOptions);

    private static string? CanonicalRole(string name) => name switch {
        "--hfx-color-surface" => "--hfx-color-surface-card",
        "--hfx-color-border" => "--hfx-color-surface-line",
        "--hfx-color-text" => "--hfx-color-text-primary",
        "--hfx-color-text-muted" => "--hfx-color-text-secondary",
        _ => null
    };

    /// <summary>Only originally bare references expand; JSON values already carry their nested defaults.</summary>
    internal static string Expand(string source) {
        var expanded = Regex.Replace(source, @"var\((--hfx-[a-z0-9-]+)\)", match => {
            var name = match.Groups[1].Value;
            Assert.True(Fallbacks.TryGetValue(name, out var value), "Missing shared fallback: " + name);
            var fallback = "var(" + name + "," + value + ")";
            var canonical = CanonicalRole(name);
            return canonical == null ? fallback : "var(" + canonical + "," + fallback + ")";
        }).Replace("__CX_STATUS_FALLBACKS__", StatusFallbackJson);
        foreach (var pair in new[] { ("TEXT", "--hfx-color-text"), ("SURFACE", "--hfx-color-surface"), ("BORDER", "--hfx-color-border-control") }) {
            var value = Fallbacks[pair.Item2];
            var light = Regex.Match(value, @"^light-dark\(([^,()]+),[^()]+\)$");
            expanded = expanded.Replace("__CX_PRINT_" + pair.Item1 + "__", light.Success ? light.Groups[1].Value.Trim() : value);
        }
        return expanded;
    }

    internal static void AssertRuntimeBudget(CanopyRuntime runtime, int componentBudget) {
        var compressed = Gzip(CanopyHtmlAssets.GetScript(runtime)) + Gzip(CanopyHtmlAssets.GetStyle(runtime));
        var component = Gzip(WithoutFallbackPayload(CanopyHtmlAssets.GetScript(runtime))) + Gzip(WithoutFallbackPayload(CanopyHtmlAssets.GetStyle(runtime)));
        Assert.True(component <= componentBudget, runtime + " component assets are " + component + " bytes gzip; their unchanged limit is " + componentBudget + ".");
        Assert.True(compressed <= componentBudget + Allowance,
            runtime + " assets are " + compressed + " bytes gzip; the component budget is " + componentBudget +
            " bytes plus the separately guarded shared-token allowance of " + Allowance + " bytes.");
    }

    /// <summary>Removes use-site defaults, including nested functions, to measure their actual gzip cost in shipped assets.</summary>
    internal static string WithoutFallbackPayload(string asset) {
        foreach (var part in new[] { "02-design-tokens.js", "86-shared-density.js" }) {
            var source = File.ReadAllText(Path.Combine(RepositoryPaths.Root, "CanopyX.Html", "Assets", "canopyx.source", part)).Replace("\r\n", "\n");
            var code = string.Join("\n", source.Split('\n').Select(line => line.Trim()).Where(line => line.Length > 0 && !line.StartsWith("//", StringComparison.Ordinal))) + "\n";
            asset = asset.Replace(RuntimeAssetTests.CompressScriptSpacing(Expand(code)), "");
        }
        asset = Regex.Replace(asset, @"const STATUS_FALLBACKS\s*=\s*\{[^\r\n]*?\};?", "");
        var output = new StringBuilder();
        var offset = 0;
        foreach (Match match in Regex.Matches(asset, @"var\((--hfx-[a-z0-9-]+),")) {
            if (match.Index < offset) continue; // The outer fallback owns its nested references.
            output.Append(asset, offset, match.Index - offset);
            var depth = 1;
            var end = match.Index + match.Length;
            while (end < asset.Length && depth > 0) {
                if (asset[end] == '(') depth++;
                if (asset[end] == ')') depth--;
                end++;
            }
            Assert.True(depth == 0, "An assembled shared-token fallback has unbalanced parentheses.");
            var name = match.Groups[1].Value;
            var nested = Regex.Match(asset.Substring(match.Index + match.Length), @"^var\((--hfx-[a-z0-9-]+),").Groups[1].Value;
            if (CanonicalRole(nested) == name) name = nested;
            output.Append("var(").Append(name).Append(')');
            offset = end;
        }
        // A size between role steps is a multiple of a role (calc(var(--hfx-space-1)*2.5)); like the fallbacks, that is
        // theming overhead under the shared allowance, so the component budget measures it as the bare role.
        return Regex.Replace(output.Append(asset, offset, asset.Length - offset).ToString(), @"calc\(var\((--hfx-[a-z0-9-]+)\)\*-?[\d.]+\)", "var($1)");
    }

    internal static long Gzip(string value) {
        using var buffer = new MemoryStream();
        using (var gzip = new GZipStream(buffer, CompressionLevel.SmallestSize, leaveOpen: true)) {
            var bytes = Encoding.UTF8.GetBytes(value);
            gzip.Write(bytes, 0, bytes.Length);
        }
        return buffer.Length;
    }
}
