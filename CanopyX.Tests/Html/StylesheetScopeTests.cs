using System.Text;
using System.Text.RegularExpressions;

namespace CanopyX.Tests.Html;

/// <summary>
/// Every page carries the core runtime (canopyx.source), so a part's stylesheet that names only classes the core runtime uses
/// restyles the core trees on that page too: the filter editor's old <c>.cx-group</c> rule collapsed tree group rows. Each part
/// stylesheet scopes its rules with at least one class of its own.
/// </summary>
public sealed class StylesheetScopeTests {
    // Classes a part stylesheet styles on purpose with the same meaning core gives them: the filter builder panel, whose
    // height the core flyouts (81-flyouts.js) read.
    private static readonly HashSet<string> SharedOnPurpose = new(StringComparer.Ordinal) { "cx-fb" };

    [Fact]
    public void PartStylesheets_NameAClassOfTheirOwnInEverySelector() {
        var assets = Path.Combine(RepositoryPaths.Root, "CanopyX.Html", "Assets");
        var core = CoreClasses(Path.Combine(assets, "canopyx.source"));
        Assert.Contains("cx-group", core);
        var findings = new List<string>();
        foreach (var directory in Directory.EnumerateDirectories(assets, "canopyx.*source").Where(item => Path.GetFileName(item) != "canopyx.source")) {
            foreach (var file in Directory.EnumerateFiles(directory, "*.css")) {
                findings.AddRange(Findings(File.ReadAllText(file), core).Select(selector => Path.GetFileName(directory) + "/" + Path.GetFileName(file) + ": " + selector));
            }
        }
        Assert.True(findings.Count == 0, "Part stylesheets restyle core classes without a scope of their own:\n" + string.Join("\n", findings));
    }

    [Fact]
    public void Findings_UnscopedCoreClass_IsFlagged() {
        var core = new HashSet<string>(StringComparer.Ordinal) { "cx-group", "cx-row", "cx-fb" };
        const string css = "@layer parts;\n/* builder */\n.cx-group, .cx-fb .cx-grid-filter-group { display:grid; }\n" +
            "@media (max-width:640px) { .cx-row:is(.cx-a,.cx-b) { gap:0; } .cx-row:not(.cx-own) { gap:0; } .cx-fb > .cx-row { gap:0; } }";
        // The shared panel class scopes a rule to the filter builder; a class under :not() does not.
        Assert.Equal(new[] { ".cx-group", ".cx-row:not(.cx-own)" }, Findings(css, core));
    }

    // Selectors whose classes the core runtime all uses; a class inside :not() does not scope a rule.
    private static IEnumerable<string> Findings(string css, ISet<string> core) =>
        Selectors(css).Where(selector => {
            var classes = Regex.Matches(Regex.Replace(selector, @":not\([^()]*\)", ""), @"\.(cx-[\w-]+)").Select(match => match.Groups[1].Value).ToArray();
            return classes.Length > 0 && classes.All(name => core.Contains(name) && !SharedOnPurpose.Contains(name));
        });

    // Class names the core script writes (cx-... tokens; custom properties and data attributes are prefixed and skipped)
    // and the core stylesheet styles.
    private static HashSet<string> CoreClasses(string directory) {
        var classes = new HashSet<string>(StringComparer.Ordinal);
        foreach (var file in Directory.EnumerateFiles(directory, "*.js")) {
            foreach (Match match in Regex.Matches(File.ReadAllText(file), @"(?<![\w-])cx-[a-z0-9]+(?:-[a-z0-9]+)*(?![\w-])")) {
                classes.Add(match.Value);
            }
        }
        foreach (Match match in Regex.Matches(File.ReadAllText(Path.Combine(directory, "canopyx.css")), @"\.(cx-[\w-]+)")) {
            classes.Add(match.Groups[1].Value);
        }
        return classes;
    }

    // The selectors of each style rule, split at top-level commas; at-rule statements and preludes are skipped and their
    // blocks read.
    private static List<string> Selectors(string css) {
        var selectors = new List<string>();
        css = Regex.Replace(Regex.Replace(css, @"/\*[\s\S]*?\*/", ""), @"@[^{};]*;", "");
        foreach (Match match in Regex.Matches(css, @"([^{}]+)\{")) {
            var prelude = match.Groups[1].Value.Trim();
            if (prelude.Length == 0 || prelude.StartsWith('@')) {
                continue;
            }
            var depth = 0;
            var current = new StringBuilder();
            foreach (var character in prelude) {
                depth += character == '(' ? 1 : character == ')' ? -1 : 0;
                if (character == ',' && depth == 0) {
                    selectors.Add(current.ToString().Trim());
                    current.Clear();
                } else {
                    current.Append(character);
                }
            }
            selectors.Add(current.ToString().Trim());
        }
        return selectors;
    }
}
