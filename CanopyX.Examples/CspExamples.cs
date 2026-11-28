using System.Text;
using CanopyX.Html;
using CanopyX.Html.Ui;

namespace CanopyX.Examples;

/// <summary>
/// Pages written with <see cref="CanopyHtmlOptions.Nonce"/> for a strict Content Security Policy, in <c>csp/</c>. They carry the
/// placeholder <see cref="NoncePlaceholder"/>, which a server replaces with a fresh nonce per response, as the browser tests'
/// server does (tests/browser/specs/csp.spec.mjs): an inline tree page with icons, deep links and an html detail, an inline
/// interactive tree, an inline grid with history presenters, a calendar, a page of overlays and form controls, a bundle with
/// external assets and sidecar files, and a page of fragments that share one document and load the runtime from files.
/// <c>csp/self/</c> holds the same kinds of page without a nonce, with external assets, for a policy of
/// <c>script-src 'self'; style-src 'self'</c>: nothing in them is inline script or style.
/// </summary>
internal static class CspExamples {
    /// <summary>The nonce the pages carry; a server puts a fresh nonce in its place in each response.</summary>
    internal const string NoncePlaceholder = "CANOPYXNONCE";

    internal static void Write(string output) {
        var folder = Path.Combine(output, "csp");
        Directory.CreateDirectory(folder);
        Tree("csp-tree").Save(Path.Combine(folder, "tree.html"), new CanopyHtmlOptions { Title = "CanopyX tree under a strict policy", Nonce = NoncePlaceholder });

        var interactive = Tree("csp-interactive");
        interactive.Checkboxes = CanopyCheckboxMode.Hierarchical;
        interactive.Save(Path.Combine(folder, "interactive.html"), new CanopyHtmlOptions { Title = "CanopyX interactive tree under a strict policy", Nonce = NoncePlaceholder });

        var grid = GraphiteGridExample.View();
        grid.Save(Path.Combine(folder, "grid.html"), new CanopyHtmlOptions { Title = "CanopyX grid under a strict policy", Nonce = NoncePlaceholder });
        // A matrix: its part, canvas tiles, the tooltip, the details dialog and the print table under the same policy.
        MatrixExamples.Services(12).Save(Path.Combine(folder, "matrix.html"), new CanopyHtmlOptions { Title = "CanopyX matrix under a strict policy", Nonce = NoncePlaceholder, Height = "520px" });
        // Flows: a dialog flow with a pick step (the reporting entry point and the grid it embeds), and a task list with a host section.
        FlowActOnRowsExample.Flow().Save(Path.Combine(folder, "flow.html"), new CanopyHtmlOptions { Title = "CanopyX flow under a strict policy", Nonce = NoncePlaceholder });
        FlowSetupTasksExample.Flow().Save(Path.Combine(folder, "flow-tasks.html"), new CanopyHtmlOptions { Title = "CanopyX task list under a strict policy", Nonce = NoncePlaceholder });
        CalendarBasicExample.Basic().Save(Path.Combine(folder, "calendar.html"), new CanopyHtmlOptions { Title = "CanopyX calendar under a strict policy", Height = "720px", Nonce = NoncePlaceholder });
        File.WriteAllText(Path.Combine(folder, "ui.html"), UiPage(NoncePlaceholder, null), new UTF8Encoding(false));

        var bundleTree = new SyntheticFileTree();
        ExampleViews.FileShares("csp-bundle", bundleTree.Build(shares: 4, departments: 4, projects: 3, minFiles: 3, maxFiles: 9, longListFiles: 300))
            .SaveBundle(Path.Combine(folder, "bundle"), new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Title = "CanopyX bundle under a strict policy", Nonce = NoncePlaceholder });

        Fragments(folder);
        WriteSelf(Path.Combine(folder, "self"));
    }

    /// <summary>The same kinds of page without a nonce: every script and stylesheet is a file under assets/, so 'self' allows them.</summary>
    private static void WriteSelf(string folder) {
        Directory.CreateDirectory(folder);
        foreach (var runtime in new[] { CanopyRuntime.TreeGrid, CanopyRuntime.InteractiveTreeGrid, CanopyRuntime.DataGrid, CanopyRuntime.ReportingGrid, CanopyRuntime.Flow, CanopyRuntime.Ui }) {
            CanopyHtmlAssets.WriteTo(Path.Combine(folder, "assets"), CanopyAssetNaming.ContentHash, runtime);
        }

        CanopyHtmlOptions External(string title, string? height = null) => new() { AssetMode = CanopyAssetMode.External, Title = title, Height = height };
        Tree("csp-self-tree").Save(Path.Combine(folder, "tree.html"), External("CanopyX tree with external assets"));
        GraphiteGridExample.View().Save(Path.Combine(folder, "grid.html"), External("CanopyX grid with external assets"));
        CalendarBasicExample.Basic().Save(Path.Combine(folder, "calendar.html"), External("CanopyX calendar with external assets", "720px"));
        MatrixExamples.Services(12).Save(Path.Combine(folder, "matrix.html"), External("CanopyX matrix with external assets", "520px"));
        FlowActOnRowsExample.Flow().Save(Path.Combine(folder, "flow.html"), External("CanopyX flow with external assets"));
        // A fragment with an explicit height: without a nonce the runtime sizes it through the CSSOM.
        var fragment = GraphiteGridExample.View().ToHtmlFragment(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Height = "60vh" });
        var runtimeFiles = CanopyRuntime.ReportingGrid;
        File.WriteAllText(Path.Combine(folder, "fragment.html"), "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>CanopyX fragment with external assets</title>\n"
            + CanopyHtmlAssets.FontHead(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External })
            + "<link rel=\"stylesheet\" href=\"assets/" + CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, runtimeFiles) + "\">\n"
            + "<script src=\"assets/" + CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, runtimeFiles) + "\" defer></script>\n</head>\n<body>\n<main>\n"
            + fragment + "\n</main>\n</body>\n</html>\n", new UTF8Encoding(false));
        File.WriteAllText(Path.Combine(folder, "ui.html"), UiPage(null, "assets/"), new UTF8Encoding(false));
        var bundleTree = new SyntheticFileTree();
        ExampleViews.FileShares("csp-self-bundle", bundleTree.Build(shares: 4, departments: 4, projects: 3, minFiles: 3, maxFiles: 9, longListFiles: 300))
            .SaveBundle(Path.Combine(folder, "bundle"), External("CanopyX bundle with external assets"));
    }

    /// <summary>
    /// A page of overlays and form controls built with the typed UI builders: a dialog, a drawer, a popover, a menu, toasts, tabs,
    /// a select and a masked input. With a nonce the runtime, its stylesheet and the UI parts are inline and carry it; with an asset
    /// folder they are files the runtime loads from there.
    /// </summary>
    private static string UiPage(string? nonce, string? assets) {
        var body = new StringBuilder("<main>\n<h1>Overlays and forms</h1>\n");
        var dialog = new CanopyDialog("csp-dialog", "Rename workspace") { Description = "Give the workspace a new name.", ContentHtml = "<label>Name <input name=\"name\" value=\"Operations\"></label>" };
        dialog.Actions.Add(CanopyDialogAction.Submit("save", "Save"));
        dialog.Actions.Add(CanopyDialogAction.Cancel("Cancel"));
        body.Append(dialog.ToTriggerHtmlFragment("Rename workspace")).Append(dialog.ToHtmlFragment());
        var drawer = new CanopyDrawer("csp-drawer", "Record details") { ContentHtml = "<p>Server srv01 in rack A.</p>" };
        body.Append(drawer.ToTriggerHtmlFragment("Show details")).Append(drawer.ToHtmlFragment());
        var popover = new CanopyPopover("csp-popover", "View options") { ContentHtml = "<label><input type=\"checkbox\" checked> Show retired servers</label>" };
        body.Append(popover.ToTriggerHtmlFragment("View options")).Append(popover.ToHtmlFragment());
        var menu = new CanopyMenu("csp-menu");
        menu.Items.Add(new CanopyMenuItem("open", "Open"));
        menu.Items.Add(new CanopyMenuItem("archive", "Archive") { Danger = true });
        body.Append(menu.ToTriggerHtmlFragment("Actions")).Append(menu.ToHtmlFragment());
        var toasts = new CanopyToasts("csp-toasts");
        toasts.Items.Add(new CanopyToast("Collected 12 servers.") { Id = "collected", Title = "Report ready", Tone = Tone.Success });
        body.Append(toasts.ToHtmlFragment());
        var tabs = new CanopyTabs("csp-tabs", "Sections");
        tabs.Tabs.Add(new CanopyTab("overview", "Overview") { ContentHtml = "<p>Overview</p>" });
        tabs.Tabs.Add(new CanopyTab("history", "History") { ContentHtml = "<p>History</p>" });
        body.Append(tabs.ToHtmlFragment());
        var select = new CanopySelect("csp-select", "site", "Site");
        select.Items.Add(new CanopySelectOption("ams", "Amsterdam"));
        select.Items.Add(new CanopySelectOption("waw", "Warsaw"));
        body.Append(select.ToHtmlFragment());
        body.Append(new CanopyMaskedInput("csp-phone", "phone", "Phone", "+00 000 000 000").ToHtmlFragment());
        body.Append("\n</main>\n");
        var runtime = CanopyRuntime.Ui;
        var head = new StringBuilder("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>CanopyX overlays and forms under a strict policy</title>\n");
        if (assets == null) {
            var attribute = " nonce=\"" + nonce + "\"";
            head.Append(CanopyHtmlAssets.FontHead(new CanopyHtmlOptions { Nonce = nonce }))
                .Append("<style").Append(attribute).Append('>').Append(CanopyHtmlAssets.GetStyle(runtime)).Append("</style>\n")
                .Append("<script").Append(attribute).Append('>').Append(CanopyHtmlAssets.GetScript(runtime)).Append("</script>\n");
            foreach (var part in CanopyHtmlAssets.GetParts(runtime)) body.Append(part.GetMarkup(nonce));
        } else {
            head.Append(CanopyHtmlAssets.FontHead(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetBaseUrl = assets }))
                .Append("<link rel=\"stylesheet\" href=\"").Append(assets).Append(CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, runtime)).Append("\">\n")
                .Append("<script src=\"").Append(assets).Append(CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, runtime)).Append("\" defer></script>\n");
        }

        return head.Append("</head>\n<body class=\"cx-page\">\n").Append(body).Append("</body>\n</html>\n").ToString();
    }

    /// <summary>The file shares tree with an html detail, which the runtime writes through the Trusted Types policy.</summary>
    private static CanopyTreeView Tree(string id) {
        var tree = new SyntheticFileTree();
        var view = ExampleViews.FileShares(id, tree.Build(shares: 2, departments: 3, projects: 2, minFiles: 2, maxFiles: 5, longListFiles: 5));
        var notes = new CanopyNode("notes", "Notes") { Kind = "folder", Icon = Icon.Named("folder"), Expanded = true };
        notes.Children.Add(new CanopyNode("notes/readme", "Read me") { Kind = "file", Icon = Icon.Named("file"), Detail = new CanopyHtmlDetail("<p class=\"csp-note\">Trusted <strong>host</strong> markup in an html detail.</p>") });
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
            .Append(CanopyHtmlAssets.FontHead(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, Nonce = NoncePlaceholder }))
            .Append("<link rel=\"stylesheet\" href=\"assets/").Append(CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, runtime)).Append("\" nonce=\"").Append(NoncePlaceholder).Append("\">\n")
            .Append("<script src=\"assets/").Append(CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, runtime)).Append("\" nonce=\"").Append(NoncePlaceholder).Append("\" defer></script>\n")
            .Append("<style nonce=\"").Append(NoncePlaceholder).Append("\">body{margin:0;padding:16px;font-family:Archivo,'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,sans-serif}main{display:grid;gap:16px}</style>\n")
            .Append("</head>\n<body>\n<main>\n<h1>Fragments</h1>\n").Append(tree).Append('\n').Append(grid).Append("\n</main>\n</body>\n</html>\n");
        File.WriteAllText(Path.Combine(folder, "fragments.html"), page.ToString(), new UTF8Encoding(false));
    }
}
