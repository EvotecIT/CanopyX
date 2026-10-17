using System.Text.Json;

namespace CanopyX.Tests.Html;

/// <summary>Reads Build/parts.json, the list of lazy runtime parts the asset assembly and CanopyX.Html share.</summary>
internal static class PartManifestFile {
    /// <summary>The parts as name, ordered script paths (folders expanded) and the scripts the entry points keep.</summary>
    internal static IReadOnlyList<(string Name, string[] Scripts, HashSet<string> Shared)> Read() {
        var root = RepositoryPaths.Root;
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Build", "parts.json")));
        var parts = new List<(string, string[], HashSet<string>)>();
        foreach (var part in document.RootElement.GetProperty("parts").EnumerateArray()) {
            var scripts = part.GetProperty("scripts").EnumerateArray().SelectMany<JsonElement, string>(item => {
                var path = Path.GetFullPath(Path.Combine(root, item.GetString()!));
                return Directory.Exists(path) ? Directory.EnumerateFiles(path, "*.js").OrderBy(Path.GetFileName, StringComparer.Ordinal).ToArray() : new[] { path };
            }).ToArray();
            var shared = part.TryGetProperty("shared", out var list)
                ? list.EnumerateArray().Select(item => Path.GetFullPath(Path.Combine(root, item.GetString()!))).ToHashSet(StringComparer.OrdinalIgnoreCase)
                : new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            parts.Add((part.GetProperty("name").GetString()!, scripts, shared));
        }
        return parts;
    }

    /// <summary>Every script a part owns: listed by a part and not shared with the entry points.</summary>
    internal static HashSet<string> OwnedScripts() =>
        Read().SelectMany(part => part.Scripts.Where(script => !part.Shared.Contains(script))).ToHashSet(StringComparer.OrdinalIgnoreCase);

    /// <summary>The scripts of one part, in assembly order.</summary>
    internal static string[] Scripts(string name) => Read().Single(part => part.Name == name).Scripts;
}