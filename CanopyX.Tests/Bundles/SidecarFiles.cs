using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace CanopyX.Tests.Bundles;

/// <summary>
/// Reads every sidecar file of a bundle the way a browser does and checks each file's wrapper. A pack file holds its
/// pages as <c>String.raw</c> templates; they are read as the strings the script produces.
/// </summary>
internal sealed class SidecarFiles {
    private static readonly Regex Wrapper = new(@"^\(self\.CanopyXSidecar = self\.CanopyXSidecar \|\| \[\]\)\.push\((\[.*\])\);\n$", RegexOptions.Singleline);
    private static readonly Regex RawTemplate = new("String\\.raw`([^`]*)`");
    private static readonly Regex PackedPage = new(@"^(p/\d+)#(\d+)$");
    private readonly Dictionary<string, string[]> _packs = new(StringComparer.Ordinal);

    internal SidecarFiles(string dataDirectory, string viewId) {
        foreach (var path in Directory.EnumerateFiles(dataDirectory, "*.js", SearchOption.AllDirectories)) {
            var reference = Path.GetRelativePath(dataDirectory, path).Replace('\\', '/');
            reference = reference.Substring(0, reference.Length - 3);
            var text = File.ReadAllText(path);
            var match = Wrapper.Match(text);
            Assert.True(match.Success, "Sidecar file has an unexpected wrapper: " + reference);
            var body = match.Groups[1].Value;
            if (reference.StartsWith("p/", StringComparison.Ordinal)) {
                // String.raw keeps every character between the backticks, and ${ would start a substitution.
                body = RawTemplate.Replace(body, template => {
                    Assert.DoesNotContain("${", template.Groups[1].Value);
                    return JsonSerializer.Serialize(template.Groups[1].Value);
                });
            }

            var entry = JsonNode.Parse(body)!.AsArray();
            Assert.Equal(viewId, entry[0]!.GetValue<string>());
            Assert.Equal(reference, entry[1]!.GetValue<string>());
            Documents[reference] = entry[2]!.ToJsonString();
            Sizes[reference] = new FileInfo(path).Length;
        }
    }

    /// <summary>Gets the document of every file by its reference. A pack document holds its pages as JSON text.</summary>
    internal Dictionary<string, string> Documents { get; } = new(StringComparer.Ordinal);

    internal Dictionary<string, long> Sizes { get; } = new(StringComparer.Ordinal);

    /// <summary>Gets every page document: the top-level page files and the pages inside the packs, by reference.</summary>
    internal IEnumerable<KeyValuePair<string, string>> Pages() {
        foreach (var document in Documents) {
            if (document.Key.StartsWith("r/", StringComparison.Ordinal)) {
                yield return document;
            } else if (document.Key.StartsWith("p/", StringComparison.Ordinal)) {
                var pages = JsonNode.Parse(document.Value)!["pages"]!.AsArray();
                for (var slot = 0; slot < pages.Count; slot++) {
                    yield return new KeyValuePair<string, string>(document.Key + "#" + slot, pages[slot]!.GetValue<string>());
                }
            }
        }
    }

    /// <summary>Reads a document by reference; <c>p/&lt;n&gt;#&lt;slot&gt;</c> reads one page out of a pack.</summary>
    internal JsonNode Document(string reference) {
        var packed = PackedPage.Match(reference);
        if (packed.Success) {
            if (!_packs.TryGetValue(packed.Groups[1].Value, out var pages)) {
                pages = Document(packed.Groups[1].Value)["pages"]!.AsArray().Select(page => page!.GetValue<string>()).ToArray();
                _packs.Add(packed.Groups[1].Value, pages);
            }

            var slot = int.Parse(packed.Groups[2].Value, System.Globalization.CultureInfo.InvariantCulture);
            Assert.True(slot < pages.Length, "Missing packed page: " + reference);
            return JsonNode.Parse(pages[slot])!;
        }

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
