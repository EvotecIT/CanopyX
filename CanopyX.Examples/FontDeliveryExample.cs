using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>Standalone font delivery, including numeric and monospaced columns.</summary>
internal static class FontDeliveryExample {
    internal static void Write(string output) {
        var view = new CanopyDataGridView("font-delivery", "Bundled typography");
        view.Columns.Add(new CanopyColumn("name", "Record") { RowHeader = true });
        view.Columns.Add(new CanopyColumn("code", "Identifier") { Presenter = CanopyGridPresenter.Identifier(mono: true) });
        view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number });
        view.Rows.Add(new CanopyGridRow("first") { Cells = { ["name"] = "Zażółć gęślą jaźń", ["code"] = "REC-WWW11111111-000001", ["amount"] = 111111 } });
        view.Rows.Add(new CanopyGridRow("second") { Cells = { ["name"] = "Example record", ["code"] = "REC-WWW88888888-000888", ["amount"] = 888888 } });
        var directory = Path.Combine(output, "fonts");
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "inline.html"), view.ToHtmlPage());
        foreach (var naming in new[] { CanopyAssetNaming.Plain, CanopyAssetNaming.ContentHash }) {
            var mode = naming == CanopyAssetNaming.Plain ? "plain" : "hashed";
            CanopyHtmlAssets.WriteTo(Path.Combine(directory, mode), naming, CanopyRuntime.DataGrid);
            File.WriteAllText(Path.Combine(directory, mode + ".html"), view.ToHtmlPage(new CanopyHtmlOptions {
                AssetMode = CanopyAssetMode.External, AssetNaming = naming, AssetBaseUrl = mode
            }));
        }
        // A page-composition host already owns its faces; fragments and runtime CSS add none.
        File.WriteAllText(Path.Combine(directory, "hosted.html"),
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Hosted typography</title>"
            + CanopyHtmlAssets.FontHead(new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External, AssetNaming = CanopyAssetNaming.Plain, AssetBaseUrl = "plain" })
            + "<style>" + CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid)
            + "</style><script>" + CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid) + "</script></head><body>"
            + view.ToHtmlFragment() + "</body></html>");
        File.WriteAllText(Path.Combine(directory, "static-report.html"),
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Static typography</title>"
            + CanopyHtmlAssets.FontHead() + "</head><body>" + CanopyStaticHtml.RenderGrid(view)
            + CanopyStaticHtml.RenderGrid(view) + "</body></html>");
    }
}
