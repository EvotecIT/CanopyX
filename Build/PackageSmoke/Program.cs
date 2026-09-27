// Package smoke: Build.ps1 copies this file into a temporary console app that references the freshly packed
// CanopyX.Html package from a local feed, then runs it. It proves the published surface works outside the solution.
using CanopyX;
using CanopyX.Html;

var output = Path.Combine(AppContext.BaseDirectory, "smoke-output");

var view = new CanopyView("smoke", "Package smoke");
view.Columns.Add(new CanopyColumn("name", "Name"));
view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number });
var root = new CanopyNode("root", "Root");
root.Cells["size"] = 42;
root.Children.Add(new CanopyNode("root/child", "Child"));
view.Roots.Add(root);

var page = view.ToHtmlPage();
Require(page.Contains("data-canopyx-host", StringComparison.Ordinal), "the page has no view host element");
Require(page.Contains("\"protocol\":\"canopyx/1\"", StringComparison.Ordinal), "the page has no view document");
Require(page.Contains(CanopyHtmlAssets.Script, StringComparison.Ordinal), "the page does not inline the runtime");

var assets = CanopyHtmlAssets.WriteTo(Path.Combine(output, "assets"));
Require(assets.All(File.Exists), "the asset files were not written");

Console.WriteLine("CanopyX package smoke passed.");

static void Require(bool condition, string failure) {
    if (!condition) {
        throw new InvalidOperationException("CanopyX package smoke failed: " + failure + ".");
    }
}
