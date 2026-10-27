using System.Text;
using System.Text.RegularExpressions;
using CanopyX.Html;

namespace CanopyX.Tests.Html;

/// <summary>
/// The runtime ships as embedded native assets. The assembled script must match its source parts, fit the size
/// budget in docs/architecture.md, and be safe to inline into a page.
/// </summary>
public sealed class RuntimeAssetTests {
    [Theory]
    [InlineData(CanopyRuntime.TreeGrid)]
    [InlineData(CanopyRuntime.InteractiveTreeGrid)]
    [InlineData(CanopyRuntime.DataGrid)]
    [InlineData(CanopyRuntime.ReportingGrid)]
    [InlineData(CanopyRuntime.Flow)]
    public void Script_MatchesItsSourceParts(CanopyRuntime runtime) {
        var root = RepositoryPaths.Root;
        var files = Directory.EnumerateFiles(Path.Combine(root, "CanopyX.Html", "Assets", "canopyx.source"), "*.js")
            .OrderBy(Path.GetFileName, StringComparer.Ordinal).ToArray();
        // The grid entry points carry the flow shell (createFlow loads the flow parts); the flow entry point takes the core's small
        // shared parts by name, the grid's pure helpers, the part loader and the same shell, without any grid or tree code.
        var flowShell = Path.Combine(root, "CanopyX.Html", "Assets", "canopyx.flow-entry.source", "50-flow-shell.js");
        var grid = runtime == CanopyRuntime.DataGrid || runtime == CanopyRuntime.ReportingGrid;
        if (runtime == CanopyRuntime.Flow) {
            files = new[] { "canopyx.flow-entry.source/00-flow-entry.js", "canopyx.source/01-fill.js", "canopyx.source/01-number-format.js", "canopyx.source/01-trust.js", "canopyx.source/02-design-tokens.js",
                "canopyx.source/05-patterns.js", "canopyx.source/05-search-folding.js", "canopyx.grid.source/00-grid-pure.js", "canopyx.source/82-parts.js",
                "canopyx.flow-entry.source/50-flow-shell.js", "canopyx.flow-entry.source/90-flow-boot.js" }
                .Select(name => Path.Combine(root, "CanopyX.Html", "Assets", name.Replace('/', Path.DirectorySeparatorChar))).ToArray();
        } else if (runtime != CanopyRuntime.TreeGrid) {
            var extensions = runtime == CanopyRuntime.DataGrid || runtime == CanopyRuntime.ReportingGrid
                ? Directory.EnumerateFiles(Path.Combine(root, "CanopyX.Html", "Assets", "canopyx.grid.source"), "*.js").OrderBy(Path.GetFileName, StringComparer.Ordinal)
                : Enumerable.Empty<string>();
            files = files.Where(file => string.CompareOrdinal(Path.GetFileName(file), "90-") < 0)
                .Concat(extensions)
                .Concat(Directory.EnumerateFiles(Path.Combine(root, "CanopyX.Html", "Assets", "canopyx.interactive.source"), "*.js").OrderBy(Path.GetFileName, StringComparer.Ordinal))
                .Concat(runtime == CanopyRuntime.ReportingGrid
                    ? Directory.EnumerateFiles(Path.Combine(root, "CanopyX.Html", "Assets", "canopyx.reporting.source"), "*.js").OrderBy(Path.GetFileName, StringComparer.Ordinal)
                    : Enumerable.Empty<string>())
                .Concat(grid ? new[] { flowShell } : Enumerable.Empty<string>())
                .Concat(files.Where(file => string.CompareOrdinal(Path.GetFileName(file), "90-") >= 0)).ToArray();
        }
        // Entry points leave out every script a lazy part owns (Build/parts.json lists it and not as shared).
        var owned = PartManifestFile.OwnedScripts();
        files = files.Where(file => !owned.Contains(Path.GetFullPath(file))).ToArray();
        // Tree-only core parts (the tree menus' labels) are defined again by the grid parts, so grid runtimes leave them out.
        var treeOnlyParts = System.Text.Json.JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(root, "Build", "tree-only-parts.json")))!;
        var treeOnlyPaths = treeOnlyParts.Select(part => Path.GetFullPath(Path.Combine(root, part))).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (grid) files = files.Where(file => !treeOnlyPaths.Contains(Path.GetFullPath(file))).ToArray();
        var script = CanopyHtmlAssets.GetScript(runtime);
        var parts = files
            .Select(part => Normalize(File.ReadAllText(part)).TrimEnd('\n'))
            .ToArray();

        var expected = WithoutCommentLines(string.Join("\n", parts) + "\n");
        const string marker = "__CANOPYX_FOLD_PAIRS__";
        Assert.Contains(marker, expected);
        var tableSource = File.ReadAllText(Path.Combine(root, "CanopyX", "Search", "CanopySearchFoldingTable.cs"));
        var start = tableSource.IndexOf("internal const string LowercasePairs =", StringComparison.Ordinal);
        Assert.True(start >= 0, "The canonical search folding table is missing.");
        var end = tableSource.IndexOf(';', start);
        Assert.True(end > start, "The canonical search folding table is incomplete.");
        var pieces = Regex.Matches(tableSource.Substring(start, end - start), "\"([A-Za-z0-9+/=]+)\"");
        var encoded = string.Concat(pieces.Cast<Match>().Select(match => match.Groups[1].Value));
        Assert.NotEmpty(encoded);
        var actual = Regex.Match(script, "const EXTRA_FOLD_PAIRS\\s*=\\s*\"([0-9a-z.,-]+)\";");
        Assert.True(actual.Success, "The browser folding table is missing.");
        var compact = actual.Groups[1].Value;
        Assert.Equal(Convert.FromBase64String(encoded), ExpandFoldingTable(compact));
        expected = expected.Replace(marker, compact);
        // The entry point reads the manifest of the parts it knows: name -> [version, hashed script, hashed stylesheet].
        const string partsMarker = "__CX_PARTS__";
        Assert.Contains(partsMarker, expected);
        expected = expected.Replace(partsMarker, "{" + string.Join(",", CanopyHtmlAssets.GetParts(runtime).Select(part => "\"" + part.Name + "\":[" +
            string.Join(",", new[] { part.Version, part.HashedScriptFileName, part.HashedStyleFileName }.Where(value => value != null).Select(value => "\"" + value + "\"")) + "]")) + "}");
        expected = CompressScriptSpacing(SharedTokenAssets.Expand(expected));

        Assert.True(parts.Length >= 3, "The runtime should be split into source parts.");
        Assert.True(expected == Normalize(script), "Runtime script is out of date. Run Build/Sync-Assets.ps1.");
    }

    [Theory]
    [InlineData(CanopyRuntime.TreeGrid)]
    [InlineData(CanopyRuntime.InteractiveTreeGrid)]
    [InlineData(CanopyRuntime.DataGrid)]
    [InlineData(CanopyRuntime.ReportingGrid)]
    [InlineData(CanopyRuntime.Flow)]
    public void Style_MatchesItsSource(CanopyRuntime runtime) {
        // Every entry point starts from component geometry (base.css); the flow entry point adds only its host rules, which the
        // grid entry points carry too so they can host a flow.
        var grid = runtime == CanopyRuntime.DataGrid || runtime == CanopyRuntime.ReportingGrid;
        // The shared controls (buttons, fields, chips, badges) follow the geometry in every entry point.
        var names = new List<string> { "canopyx.source/base.css", "canopyx.source/controls.css" };
        if (runtime != CanopyRuntime.Flow) names.Add("canopyx.source/canopyx.css");
        if (runtime != CanopyRuntime.TreeGrid && runtime != CanopyRuntime.Flow) names.Add("canopyx.interactive.source/canopyx.css");
        if (grid) names.AddRange(new[] { "canopyx.grid.source/chrome.css", "canopyx.grid.source/canopyx.css" });
        if (runtime == CanopyRuntime.ReportingGrid) names.Add("canopyx.reporting.source/canopyx.css");
        if (grid || runtime == CanopyRuntime.Flow) names.Add("canopyx.flow-entry.source/flow-host.css");
        var source = string.Join("\n", names.Select(name => Normalize(File.ReadAllText(Path.Combine(RepositoryPaths.Root, "CanopyX.Html", "Assets", name.Replace('/', Path.DirectorySeparatorChar)))).TrimEnd('\n')));
        Assert.Equal(CompressStyleSpacing(SharedTokenAssets.Expand(WithoutCommentLines(source + "\n"))), Normalize(CanopyHtmlAssets.GetStyle(runtime)));
    }
    [Fact]
    public void FilterEditorStyle_MatchesItsSource() {
        // The editor's own rules, the Columns menu and record drawer styles it shares with the tree tools part, then the overlay base.
        var source = string.Join("\n", new[] { "canopyx.css", "columns.css", "drawer.css", "overlay.css" }.Select(name =>
            Normalize(File.ReadAllText(Path.Combine(RepositoryPaths.Root, "CanopyX.Html", "Assets", "canopyx.filter-editor.source", name))).TrimEnd('\n')));
        Assert.Equal(CompressStyleSpacing(SharedTokenAssets.Expand(WithoutCommentLines(Normalize(source).TrimEnd('\n') + "\n"))), Normalize(CanopyHtmlAssets.FilterEditorStyle));
    }

    [Fact]
    public void Assets_StayWithinTheCompressedBudget() {
        // Combined roadmap integration: its size plus about 15%.
        SharedTokenAssets.AssertRuntimeBudget(CanopyRuntime.TreeGrid, 60928);
    }

    [Fact]
    public void InteractiveAssets_StayWithinTheirCompressedBudget() {
        // Combined roadmap integration: its size plus about 15%.
        SharedTokenAssets.AssertRuntimeBudget(CanopyRuntime.InteractiveTreeGrid, 71168);
    }

    [Fact]
    public void GridAssets_StayWithinTheirCompressedBudget() {
        // Analyst bucket/tuple queries and lazy calculations add 2 KiB above the merged shared-control shell.
        // Measured component size after integration: 130608 bytes; engines remain in optional parts.
        // The comparison and intent lazy loaders add 256 bytes of combined integration headroom.
        SharedTokenAssets.AssertRuntimeBudget(CanopyRuntime.DataGrid, 128 * 1024 + 256);
    }

    [Fact]
    public void ReportingAssets_StayWithinTheirSeparateCompressedBudget() {
        // Pivot state, typed projections and translated analyst actions add 5 KiB above the shared-control shell.
        // Measured component size: 158341 bytes. Preserve the separate 64-byte flow-facts index allowance.
        // The same optional data-view registration adds 256 bytes above the analyst/shared-controls ceiling.
        SharedTokenAssets.AssertRuntimeBudget(CanopyRuntime.ReportingGrid, 155 * 1024 + 320);
    }

    [Fact]
    public void SharedTokenPayload_StaysWithinItsSeparateAllowance() {
        var theme = File.ReadAllText(Path.Combine(RepositoryPaths.Root, "CanopyX.Html", "Assets", "canopyx.source", "02-design-tokens.js"));
        // Bound the full generated dictionary plus the expanded theme source independently of the component budgets.
        var density = File.ReadAllText(Path.Combine(RepositoryPaths.Root, "CanopyX.Html", "Assets", "canopyx.source", "86-shared-density.js"));
        var compressed = SharedTokenAssets.Gzip(SharedTokenAssets.FallbackJson) + SharedTokenAssets.Gzip(SharedTokenAssets.Expand(theme)) + SharedTokenAssets.Gzip(density);
        Assert.True(compressed <= SharedTokenAssets.Allowance,
            "Shared-token defaults and theme source are " + compressed + " bytes gzip; their separate allowance is 6 KiB.");
    }

    [Theory]
    [InlineData(CanopyRuntime.TreeGrid)]
    [InlineData(CanopyRuntime.InteractiveTreeGrid)]
    [InlineData(CanopyRuntime.DataGrid)]
    [InlineData(CanopyRuntime.ReportingGrid)]
    [InlineData(CanopyRuntime.Flow)]
    public void SharedTokenFallbacks_AddedCompressedOverheadStaysWithinItsSeparateAllowance(CanopyRuntime runtime) {
        var script = CanopyHtmlAssets.GetScript(runtime);
        var style = CanopyHtmlAssets.GetStyle(runtime);
        var overhead = SharedTokenAssets.Gzip(script) + SharedTokenAssets.Gzip(style)
            - SharedTokenAssets.Gzip(SharedTokenAssets.WithoutFallbackPayload(script))
            - SharedTokenAssets.Gzip(SharedTokenAssets.WithoutFallbackPayload(style));
        Assert.True(overhead <= SharedTokenAssets.Allowance,
            runtime + " use-site defaults add " + overhead + " bytes gzip; the separate shared-token allowance is 6 KiB.");
    }

    [Fact]
    public void LazySharedTokenFallbacks_StayWithinTheSeparateAllowance() {
        foreach (var part in CanopyHtmlAssets.Parts) {
            var actual = SharedTokenAssets.Gzip(part.Script) + (part.Style == null ? 0 : SharedTokenAssets.Gzip(part.Style));
            var component = SharedTokenAssets.Gzip(SharedTokenAssets.WithoutFallbackPayload(part.Script))
                + (part.Style == null ? 0 : SharedTokenAssets.Gzip(SharedTokenAssets.WithoutFallbackPayload(part.Style)));
            Assert.True(actual - component <= SharedTokenAssets.Allowance, part.Name + " shared fallback overhead exceeds 6 KiB.");
        }
    }

    [Fact]
    public void AssembledStyles_UseHostTokensWithoutDeclaringAPalette() {
        var files = Directory.GetFiles(Path.Combine(RepositoryPaths.Root, "CanopyX.Html", "Assets"), "*.css");
        Assert.NotEmpty(files);
        foreach (var file in files) {
            var style = File.ReadAllText(file);
            // Shared declarations would mask an inherited host theme, even if their values matched the standalone defaults.
            Assert.False(Regex.IsMatch(style, @"(?<![\w-])--hfx-[a-z0-9-]+\s*:"),
                Path.GetFileName(file) + " declares a shared host token; use a var() fallback instead.");
            Assert.False(Regex.IsMatch(style, @"var\(--hfx-[a-z0-9-]+\)"),
                Path.GetFileName(file) + " has a shared token without a standalone fallback.");
        }
    }

    [Fact]
    public void Assets_CanBeInlinedIntoAPage() {
        Assert.DoesNotContain("</script", CanopyHtmlAssets.Script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("</style", CanopyHtmlAssets.Style, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void WriteTo_WritesScriptAndStyle() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-assets-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyHtmlAssets.WriteTo(directory);

            Assert.Equal(new[] { CanopyHtmlAssets.HashedScriptFileName, CanopyHtmlAssets.HashedStyleFileName }, files.Select(Path.GetFileName));
            Assert.Equal(CanopyHtmlAssets.Script, File.ReadAllText(files[0]));
            Assert.Equal(CanopyHtmlAssets.Style, File.ReadAllText(files[1]));
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void HashedNames_CarryTheHashOfTheBytesWritten() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-assets-" + Guid.NewGuid().ToString("N"));
        try {
            // A file an older build left behind: pages written by that build still reference it.
            Directory.CreateDirectory(directory);
            var older = Path.Combine(directory, "canopyx.0123456789abcdef.js");
            File.WriteAllText(older, "older runtime");

            var files = CanopyHtmlAssets.WriteTo(directory);

            Assert.Matches("^[0-9a-f]{16}$", CanopyHtmlAssets.ScriptHash);
            Assert.Equal("canopyx." + CanopyHtmlAssets.ScriptHash + ".js", Path.GetFileName(files[0]));
            Assert.Equal("canopyx." + CanopyHtmlAssets.StyleHash + ".css", Path.GetFileName(files[1]));
            // A host that names or caches by the hash can check it against the file it serves.
            Assert.Equal(CanopyHtmlAssets.ScriptHash, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(files[0]))).ToLowerInvariant().Substring(0, 16));
            Assert.Equal(CanopyHtmlAssets.StyleHash, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(files[1]))).ToLowerInvariant().Substring(0, 16));
            Assert.Equal("older runtime", File.ReadAllText(older));
            // The hash belongs to the source, not to the line endings of the checkout the package was built from.
            Assert.DoesNotContain('\r', CanopyHtmlAssets.Script + CanopyHtmlAssets.Style);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void HashedFiles_AreNotRewrittenButADamagedOneIsReplaced() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-assets-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyHtmlAssets.WriteTo(directory);
            var written = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            File.SetLastWriteTimeUtc(files[0], written);
            File.WriteAllText(files[1], "truncated");

            // A server may be reading the file: the same content under the same name is left as it is.
            CanopyHtmlAssets.WriteTo(directory);

            Assert.Equal(written, File.GetLastWriteTimeUtc(files[0]));
            Assert.Equal(CanopyHtmlAssets.Style, File.ReadAllText(files[1]));
            // The runtime and its stylesheet, the tree tools part every tree loads beside them, the export, links and search parts,
            // the link, highlight, layout mode and record panel parts, each with its stylesheet, plus the six lazy UI parts
            // (one script and one stylesheet each).
            Assert.Equal(27, Directory.GetFiles(directory).Length);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void PlainNaming_WritesAndReferencesTheFixedNames() {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-assets-" + Guid.NewGuid().ToString("N"));
        try {
            var view = new CanopyTreeView("v", "Files");
            view.Columns.Add(new CanopyColumn("name", "Name"));
            var options = new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetNaming = CanopyAssetNaming.Plain };

            var files = CanopyHtmlAssets.WriteTo(directory, options.AssetNaming);
            var page = view.ToHtmlPage(options);

            Assert.Equal(new[] { "canopyx.js", "canopyx.css" }, files.Select(Path.GetFileName));
            Assert.Contains("<link rel=\"stylesheet\" href=\"assets/canopyx.css\">", page);
            Assert.Contains("<script src=\"assets/canopyx.js\" defer></script>", page);
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void Script_ShipsWithoutTheCommentsOfItsSourceParts() {
        var script = Normalize(CanopyHtmlAssets.Script);
        var lines = script.Split('\n');

        // The header that says what the file is stays; the documentation of the parts does not ship.
        Assert.DoesNotContain(lines, line => line.TrimStart().StartsWith("//", StringComparison.Ordinal));
        Assert.Single(lines, line => line.TrimStart().StartsWith("/*", StringComparison.Ordinal));
    }

    /// <summary>The asset assembly removes empty and comment lines, preserving the opening header.</summary>
    private static string WithoutCommentLines(string content) {
        var kept = new List<string>();
        var inBlock = false;
        var header = content.StartsWith("/*", StringComparison.Ordinal);
        foreach (var line in content.Split('\n')) {
            var text = line.Trim();
            if (inBlock || text.StartsWith("/*", StringComparison.Ordinal)) {
                var end = text.IndexOf("*/", inBlock ? 0 : 2, StringComparison.Ordinal);
                Assert.True(end < 0 || end + 2 == text.Length, "Code shares a line with a comment: " + text);
                inBlock = end < 0;
                if (header) {
                    kept.Add(line);
                    header = inBlock;
                }

                continue;
            }

            if (text.Length == 0 || text.StartsWith("//", StringComparison.Ordinal)) {
                continue;
            }

            var opens = text.IndexOf("/*", StringComparison.Ordinal);
            Assert.False(text.Contains('`') || text.EndsWith('\\') || (opens > 0 && text.IndexOf("*/", opens, StringComparison.Ordinal) < 0),
                "A line the comment rule could misread: " + text);
            kept.Add(text);
        }

        return string.Join("\n", kept) + "\n";
    }

    private static string Normalize(string value) => value.Replace("\r\n", "\n").Replace("\r", "\n");

    private static string CompressStyleSpacing(string value) => string.Join("\n", value.Split('\n').Select(line => {
        var parts = Regex.Split(line, "(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')");
        for (var i = 0; i < parts.Length; i += 2) {
            var part = Regex.Replace(parts[i], @"\s*([{}])\s*", "$1");
            part = Regex.Replace(part, @"([;,])\s+", "$1");
            parts[i] = Regex.Replace(part, @"((?:^|[{;])-*[A-Za-z][\w-]*):\s+", "$1:");
        }
        return string.Concat(parts);
    }));

    internal static string CompressScriptSpacing(string value) {
        var output = new StringBuilder();
        var previous = "";
        var slash = false;
        foreach (var line in value.Split('\n')) {
            var parts = Regex.Split(line, "(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|/.*)");
            for (var i = 0; i < parts.Length; i += 2) {
                parts[i] = Regex.Replace(parts[i], @"\s*([=(){},;\[\]<>!&|?:%*^])\s*", "$1");
                parts[i] = Regex.Replace(parts[i], @"(?<![+\-\s])\s+([+\-])\s+(?![+\-\s])", "$1");
                parts[i] = parts[i].Replace(";}", "}");
            }
            var compact = string.Concat(parts);
            if (output.Length > 0 && (slash || (!Regex.IsMatch(previous, @"[;,{(\[]$") && !Regex.IsMatch(compact, @"^[)}\]]")))) output.Append('\n');
            else if (output.Length > 0 && compact.StartsWith('}') && previous.EndsWith(';')) output.Length--;
            output.Append(compact);
            previous = compact;
            slash = parts.Any(part => part.StartsWith("/", StringComparison.Ordinal));
        }
        return output.ToString();
    }

    /// <summary>Decodes the browser representation independently and compares every pair to the canonical table.</summary>
    private static byte[] ExpandFoldingTable(string encoded) {
        using var expanded = new MemoryStream();
        using var writer = new BinaryWriter(expanded);
        var unit = 0;
        foreach (var record in encoded.Split(',')) {
            var fields = record.Split('.').Select(ParseBase36).ToArray();
            Assert.True(fields.Length is 2 or 4, "Invalid browser folding record.");
            var count = fields.Length == 4 ? fields[2] : 1;
            var step = fields.Length == 4 ? fields[3] : 0;
            Assert.True(fields[0] > 0 && (fields.Length == 2 || count >= 3 && step > 0), "Invalid browser folding record.");
            unit += fields[0];
            Assert.True(unit + (count - 1) * step <= ushort.MaxValue && unit + fields[1] >= 0 && unit + (count - 1) * step + fields[1] <= ushort.MaxValue);
            for (var index = 0; index < count; index++) {
                writer.Write((ushort)(unit + index * step)); writer.Write((ushort)(unit + index * step + fields[1]));
            }
            unit += (count - 1) * step;
        }
        return expanded.ToArray();
    }

    private static int ParseBase36(string text) {
        Assert.Matches("^-?[0-9a-z]+$", text);
        var value = 0;
        foreach (var digit in text.TrimStart('-')) value = checked(value * 36 + (digit <= '9' ? digit - '0' : digit - 'a' + 10));
        return text[0] == '-' ? -value : value;
    }
}
