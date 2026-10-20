using System.Text;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// Pages written with <see cref="CanopyHtmlOptions.Nonce"/> for a strict Content Security Policy, in <c>csp/</c>. They carry the
/// placeholder <see cref="NoncePlaceholder"/>, which a server replaces with a fresh nonce per response, as the browser tests'
/// server does (tests/browser/specs/csp.spec.mjs): an inline tree page with icons, deep links and an html detail, an inline
/// interactive tree, an inline grid with history presenters, a bundle with external assets and sidecar files, and a page of
/// fragments that share one document and load the runtime from files.
/// </summary>
internal static class CspExamples {
    /// <summary>The nonce the pages carry; a server puts a fresh nonce in its place in each response.</summary>
    internal const string NoncePlaceholder = "CANOPYXNONCE";

    internal static void Write(string output) {
        var folder = Path.Combine(output, "csp");
        Directory.CreateDirectory(folder);
        Tree("csp-tree").SaveHtmlPage(Path.Combine(folder, "tree.html"), new CanopyHtmlOptions { Title = "CanopyX tree under a strict policy", Nonce = NoncePlaceholder });

        var interactive = Tree("csp-interactive");
        interactive.Checkboxes = CanopyCheckboxMode.Hierarchical;
        interactive.SaveHtmlPage(Path.Combine(folder, "interactive.html"), new CanopyHtmlOptions { Title = "CanopyX interactive tree under a strict policy", Nonce = NoncePlaceholder });

        var grid = GraphiteGridExample.View();
        grid.SaveHtmlPage(Path.Combine(folder, "grid.html"), new CanopyHtmlOptions { Title = "CanopyX grid under a strict policy", Nonce = NoncePlaceholder });
        // A matrix: its part, canvas tiles, the tooltip, the details dialog and the print table under the same policy.
        MatrixExamples.Services(12).SaveHtmlPage(Path.Combine(folder, "matrix.html"), new CanopyHtmlOptions { Title = "CanopyX matrix under a strict policy", Nonce = NoncePlaceholder, Height = "520px" });

        var bundleTree = new SyntheticFileTree();
        ExampleViews.FileShares("csp-bundle", bundleTree.Build(shares: 4, departments: 4, projects: 3, minFiles: 3, maxFiles: 9, longListFiles: 300))
            .SaveHtmlBundle(Path.Combine(folder, "bundle"), new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = "CanopyX bundle under a strict policy", Nonce = NoncePlaceholder });

        Fragments(folder);
    }

    /// <summary>The file shares tree with an html detail, which the runtime writes through the Trusted Types policy.</summary>
    private static CanopyTreeView Tree(string id) {
        var tree = new SyntheticFileTree();
        var view = ExampleViews.FileShares(id, tree.Build(shares: 2, departments: 3, projects: 2, minFiles: 2, maxFiles: 5, longListFiles: 5));
        var notes = new CanopyNode("notes", "Notes") { Kind = "folder", Icon = "folder", Expanded = true };
        notes.Children.Add(new CanopyNode("notes/readme", "Read me") { Kind = "file", Icon = "file", Detail = new CanopyHtmlDetail("<p class=\"csp-note\">Trusted <strong>host</strong> markup in an html detail.</p>") });
        view.Roots.Insert(0, notes);
        return view;
    }

    /// <summary>Two fragments in one host page: one document embeds each part once, the runtime loads from files, and the heights use nonced rules.</summary>
    private static void Fragments(string folder) {
        var runtime = CanopyRuntime.ReportingGrid;
        CanopyHtmlAssets.WriteTo(Path.Combine(folder, "assets"), CanopyAssetNaming.ContentHash, runtime);
        var document = new CanopyHtmlDocument();
        var tree = Tree("csp-fragment-tree").ToHtmlFragment(new CanopyHtmlOptions { Document = document, Height = "50vh", Nonce = NoncePlaceholder });
        var grid = GraphiteGridExample.View().ToHtmlFragment(new CanopyHtmlOptions { Document = document, Height = "60vh", Nonce = NoncePlaceholder });
        var page = new StringBuilder()
            .Append("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n")
            .Append("<title>CanopyX fragments under a strict policy</title>\n")
            .Append("<link rel=\"stylesheet\" href=\"assets/").Append(CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, runtime)).Append("\" nonce=\"").Append(NoncePlaceholder).Append("\">\n")
            .Append("<script src=\"assets/").Append(CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, runtime)).Append("\" nonce=\"").Append(NoncePlaceholder).Append("\" defer></script>\n")
            .Append("<style nonce=\"").Append(NoncePlaceholder).Append("\">body{margin:0;padding:16px;font-family:system-ui,sans-serif}main{display:grid;gap:16px}</style>\n")
            .Append("</head>\n<body>\n<main>\n<h1>Fragments</h1>\n").Append(tree).Append('\n').Append(grid).Append("\n</main>\n</body>\n</html>\n");
        File.WriteAllText(Path.Combine(folder, "fragments.html"), page.ToString(), new UTF8Encoding(false));
    }
}
