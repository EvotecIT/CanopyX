using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A bundle fixture for dictionary keys and text that have special JavaScript syntax.</summary>
internal static class SidecarKeysExample {
    internal static void Write(string output) {
        var view = new CanopyTreeView("sidecar-keys", "Sidecar dictionary keys");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("__proto__", "Mapped metadata") { Sizing = CanopyColumnSizing.Preferred(420) });
        var root = new CanopyNode("root", "Root") { Expanded = true };
        var child = new CanopyNode("child", "Child");
        root.Cells["__proto__"] = new CanopyCell(42) { Text = "Root ` ${value} <metadata>" };
        child.Cells["__proto__"] = new CanopyCell(42) { Text = "Child ` ${value} <metadata>" };
        root.Children.Add(child);
        view.Roots.Add(root);
        view.SaveHtmlBundle(Path.Combine(output, "sidecar-keys"), new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External });
    }
}
