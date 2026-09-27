using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace CanopyX.Tests.Bundles;

/// <summary>Reads every sidecar file of a bundle and checks each file's wrapper.</summary>
internal sealed class SidecarFiles {
    private static readonly Regex Wrapper = new(@"^\(self\.CanopyXSidecar = self\.CanopyXSidecar \|\| \[\]\)\.push\((\[.*\])\);\n$", RegexOptions.Singleline);

    internal SidecarFiles(string dataDirectory, string viewId) {
        foreach (var path in Directory.EnumerateFiles(dataDirectory, "*.js", SearchOption.AllDirectories)) {
            var reference = Path.GetRelativePath(dataDirectory, path).Replace('\\', '/');
            reference = reference.Substring(0, reference.Length - 3);
            var text = File.ReadAllText(path);
            var match = Wrapper.Match(text);
            Assert.True(match.Success, "Sidecar file has an unexpected wrapper: " + reference);
            var entry = JsonNode.Parse(match.Groups[1].Value)!.AsArray();
            Assert.Equal(viewId, entry[0]!.GetValue<string>());
            Assert.Equal(reference, entry[1]!.GetValue<string>());
            Documents[reference] = entry[2]!.ToJsonString();
            Sizes[reference] = new FileInfo(path).Length;
        }
    }

    internal Dictionary<string, string> Documents { get; } = new(StringComparer.Ordinal);

    internal Dictionary<string, long> Sizes { get; } = new(StringComparer.Ordinal);

    internal JsonNode Document(string reference) {
        Assert.True(Documents.ContainsKey(reference), "Missing sidecar file: " + reference);
        return JsonNode.Parse(Documents[reference])!;
    }

    /// <summary>Follows the manifest, "next" continuations, and node references the way the runtime does; returns ids depth first.</summary>
    internal List<string> WalkIds() {
        var ids = new List<string>();
        Walk(Document("manifest")["root"]!.GetValue<string>(), ids);
        return ids;
    }

    private void Walk(string firstPage, List<string> ids) {
        for (string? reference = firstPage; reference != null;) {
            var page = Document(reference);
            foreach (var item in page["items"]!.AsArray()) {
                ids.Add(item!["id"]!.GetValue<string>());
                var childRef = item["ref"]?.GetValue<string>();
                if (childRef != null) {
                    Walk(childRef, ids);
                }
            }

            reference = page["next"]?.GetValue<string>();
        }
    }
}
