// Package smoke: Build.ps1 copies this file into a temporary console app that references the freshly packed
// CanopyX.Html package from a local feed, then runs it. It proves the published surface works outside the solution.
using CanopyX;
using CanopyX.Html;
using CanopyX.Rendering;

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
Require(page.Contains("\"protocol\":\"canopyx/2\"", StringComparison.Ordinal), "the page has no view document");
Require(page.Contains(CanopyHtmlAssets.Script, StringComparison.Ordinal), "the page does not inline the runtime");

var assets = CanopyHtmlAssets.WriteTo(Path.Combine(output, "assets"));
Require(assets.All(File.Exists), "the asset files were not written");

var outline = CanopyStaticHtml.Render(view);
Require(outline.Contains("Child", StringComparison.Ordinal) && !outline.Contains("<script", StringComparison.Ordinal), "the static outline is wrong");

var bundle = view.SaveHtmlBundle(Path.Combine(output, "bundle"));
Require(bundle.NodeCount == 2 && File.Exists(Path.Combine(output, "bundle", "index.html")), "the bundle was not written");
Require(File.Exists(Path.Combine(bundle.DataDirectory, "manifest.js")), "the bundle has no manifest");
// The page references the assets under the names they were written with.
var bundlePage = File.ReadAllText(Path.Combine(output, "bundle", "index.html"));
foreach (var name in new[] { CanopyHtmlAssets.HashedScriptFileName, CanopyHtmlAssets.HashedStyleFileName }) {
    Require(bundlePage.Contains("assets/" + name, StringComparison.Ordinal) && File.Exists(Path.Combine(output, "bundle", "assets", name)), "the bundle page and its assets disagree about " + name);
}

view.Checkboxes = CanopyCheckboxMode.Hierarchical;
view.CheckIntents.Add(new CanopyCheckIntent(new[] { "root" }, true));
var checkingDirectory = Path.Combine(output, "checking");
view.SaveHtmlBundle(checkingDirectory);
var checkingPage = File.ReadAllText(Path.Combine(checkingDirectory, "index.html"));
foreach (var name in new[] {
    CanopyHtmlAssets.GetScriptFileName(CanopyAssetNaming.ContentHash, CanopyRuntime.InteractiveTreeGrid),
    CanopyHtmlAssets.GetStyleFileName(CanopyAssetNaming.ContentHash, CanopyRuntime.InteractiveTreeGrid)
}) {
    Require(checkingPage.Contains("assets/" + name, StringComparison.Ordinal) && File.Exists(Path.Combine(checkingDirectory, "assets", name)), "the checking bundle is missing " + name);
}
Require(CanopyStaticHtml.Render(view).Contains("aria-checked=\"true\"", StringComparison.Ordinal), "the static outline lost its checking intent");

Console.WriteLine("CanopyX package smoke passed.");

static void Require(bool condition, string failure) {
    if (!condition) {
        throw new InvalidOperationException("CanopyX package smoke failed: " + failure + ".");
    }
}
