using System.Globalization;
using CanopyX;

namespace SiteDemos.Docs;

/// <summary>Draws a folder that a CanopyX writer produced as a CanopyX tree: the files it holds, their sizes and their role.</summary>
internal static class FileLayout {
    /// <summary>Builds a tree view of <paramref name="directory"/>.</summary>
    /// <param name="id">The view id.</param>
    /// <param name="label">The view label and the name of the root node.</param>
    /// <param name="directory">The folder to describe.</param>
    /// <param name="expand">Whether a folder, by its path relative to <paramref name="directory"/>, starts open.</param>
    /// <param name="maxFiles">The most files listed in one folder; the rest are summed in a final row.</param>
    internal static CanopyTreeView Build(string id, string label, string directory, Func<string, bool> expand, int maxFiles = 6) {
        var view = new CanopyTreeView(id, label) { PageSize = 200, Search = new CanopySearchOptions { Placeholder = "Search the files" } };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sizing = CanopyColumnSizing.Preferred(260), Sortable = true });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(96), Sortable = true });
        view.Columns.Add(new CanopyColumn("holds", "Holds") { Sizing = CanopyColumnSizing.Preferred(340) });
        var root = Folder(new DirectoryInfo(directory), string.Empty, label, expand, maxFiles);
        root.Expanded = true;
        view.Roots.Add(root);
        return view;
    }

    private static CanopyNode Folder(DirectoryInfo folder, string path, string label, Func<string, bool> expand, int maxFiles) {
        var node = new CanopyNode(path.Length == 0 ? "root" : "d:" + path, label) { Kind = "folder", Expanded = path.Length > 0 && expand(path) };
        long total = 0;
        var count = 0;
        foreach (var child in folder.GetDirectories().OrderBy(item => item.Name, StringComparer.Ordinal)) {
            var childPath = path.Length == 0 ? child.Name : path + "/" + child.Name;
            // A data folder is named after the view and a content hash; shorten the hash so the row stays readable.
            var name = child.Name.Length > 22 ? child.Name[..14] + "…" : child.Name;
            var sub = Folder(child, childPath, name + "/", expand, maxFiles);
            total += (long)(sub.Cells["size"].Value ?? 0L);
            count += int.Parse(sub.Data["files"], CultureInfo.InvariantCulture);
            node.Children.Add(sub);
        }

        var files = folder.GetFiles().OrderBy(item => item.Name, NaturalComparer.Instance).ToList();
        foreach (var file in files.Take(maxFiles)) {
            var childPath = path.Length == 0 ? file.Name : path + "/" + file.Name;
            var leaf = new CanopyNode("f:" + childPath, file.Name) { Kind = "file" };
            leaf.Cells["size"] = Size(file.Length);
            var role = Describe(childPath, file.Name);
            if (role != null) {
                leaf.Cells["holds"] = role;
            }

            node.Children.Add(leaf);
        }

        if (files.Count > maxFiles) {
            var rest = files.Skip(maxFiles).ToList();
            var more = new CanopyNode("m:" + path, string.Format(CultureInfo.InvariantCulture, "{0:N0} more files", rest.Count)) { Kind = "more" };
            more.Cells["size"] = Size(rest.Sum(item => item.Length));
            more.Cells["holds"] = new CanopyCell("Same kind as the files above") { Tone = CanopyTone.Muted };
            node.Children.Add(more);
        }

        total += files.Sum(item => item.Length);
        count += files.Count;
        node.Cells["size"] = Size(total);
        node.Data["files"] = count.ToString(CultureInfo.InvariantCulture);
        var folderRole = Describe(path, folder.Name);
        if (path.Length == 0) {
            node.Badges.Add(new CanopyBadge(string.Format(CultureInfo.InvariantCulture, count == 1 ? "{0:N0} file" : "{0:N0} files", count), CanopyTone.Info));
        } else if (folderRole != null) {
            node.Cells["holds"] = folderRole;
        }

        return node;
    }

    /// <summary>The role of a file or folder a CanopyX writer produced, by its name.</summary>
    private static string? Describe(string path, string name) {
        var parent = path.Contains('/') ? path[..path.LastIndexOf('/')] : string.Empty;
        var parentName = parent.Contains('/') ? parent[(parent.LastIndexOf('/') + 1)..] : parent;
        if (name.EndsWith(".html", StringComparison.Ordinal)) return "The page: view definition and runtime references";
        if (name == "assets") return "Runtime script and stylesheet, named by their content";
        if (name == "data") return "Sidecar data, loaded as script files";
        if (parentName == "assets" && name.EndsWith(".js", StringComparison.Ordinal)) return name.Contains("filter-editor", StringComparison.Ordinal) ? "Filter editor, loaded on first use" : "Browser runtime";
        if (parentName == "assets" && name.EndsWith(".css", StringComparison.Ordinal)) return "Theme stylesheet";
        if (name == "manifest.js") return "First top-level page, packs and search index";
        if (parentName == "data") return "One view's data, named by its content";
        if (name == "r") return "Pages of the top-level nodes";
        if (name == "p") return "Packs: children pages of many nodes";
        if (name == "q") return "Index packs: search entries and word shards";
        if (name == "s") return "Search shards by word prefix";
        if (name == "e") return "Search entries and their ancestors";
        return null;
    }

    internal static CanopyCell Size(long bytes) => new CanopyCell(bytes) { Text = FormatBytes(bytes) };

    internal static string FormatBytes(long bytes) => bytes switch {
        < 1024 => bytes.ToString(CultureInfo.InvariantCulture) + " B",
        < 1024 * 1024 => (bytes / 1024.0).ToString("0.#", CultureInfo.InvariantCulture) + " KB",
        _ => (bytes / 1048576.0).ToString("0.#", CultureInfo.InvariantCulture) + " MB"
    };

    /// <summary>Orders "2.js" before "10.js", as a file manager does.</summary>
    private sealed class NaturalComparer : IComparer<string> {
        internal static readonly NaturalComparer Instance = new();
        public int Compare(string? x, string? y) {
            var a = Path.GetFileNameWithoutExtension(x ?? string.Empty);
            var b = Path.GetFileNameWithoutExtension(y ?? string.Empty);
            if (int.TryParse(a, NumberStyles.None, CultureInfo.InvariantCulture, out var left) && int.TryParse(b, NumberStyles.None, CultureInfo.InvariantCulture, out var right)) {
                return left.CompareTo(right);
            }

            return StringComparer.Ordinal.Compare(x, y);
        }
    }
}
