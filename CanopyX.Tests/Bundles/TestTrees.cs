namespace CanopyX.Tests.Bundles;

/// <summary>Deterministic trees for bundle and static renderer tests.</summary>
internal static class TestTrees {
    /// <summary>
    /// A file-share-like view: top-level shares with nested folders, one folder with <paramref name="bigFolder"/>
    /// files (so its children span several pages), detail rows, badges, and some non-ASCII names.
    /// </summary>
    internal static CanopyTreeView FileShares(int shares, int foldersPerShare, int filesPerFolder, int bigFolder) {
        var view = new CanopyTreeView("shares", "File shares") { Search = new CanopySearchOptions() };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sizing = CanopyColumnSizing.Preferred(300) });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number });
        var names = new[] { "Budget", "Plans", "Łódź office", "İstanbul", "Straße", "Reports", "Archive", "Αθήνα", "ΑΘΗΝΑ", "МОСКВА" };
        for (var s = 0; s < shares; s++) {
            var share = new CanopyNode("s" + s, "Share " + s + " " + names[s % names.Length]) { Group = true };
            for (var f = 0; f < foldersPerShare; f++) {
                var folder = new CanopyNode(share.Id + "/f" + f, names[(s + f) % names.Length] + " " + f);
                var count = s == 0 && f == 0 ? bigFolder : filesPerFolder;
                for (var i = 0; i < count; i++) {
                    var file = new CanopyNode(folder.Id + "/" + i, "file " + i + " " + names[i % names.Length] + ".txt");
                    file.Cells["size"] = 1000L + i;
                    if (i % 17 == 0) {
                        file.Badges.Add(new CanopyBadge("stale", CanopyTone.Warning));
                    }

                    folder.Children.Add(file);
                }

                if (f == 1) {
                    folder.Children.Add(new CanopyNode(folder.Id + "/details", "Details") { Detail = new CanopyPropertiesDetail().Add("Owner", "Team " + s) });
                }

                share.Children.Add(folder);
            }

            view.Roots.Add(share);
        }

        return view;
    }

    /// <summary>Depth-first ids of an in-memory tree.</summary>
    internal static List<string> Ids(IEnumerable<CanopyNode> roots) {
        var ids = new List<string>();
        var pending = new Stack<CanopyNode>(roots.Reverse());
        while (pending.Count > 0) {
            var node = pending.Pop();
            ids.Add(node.Id);
            foreach (var child in node.Children.Reverse()) {
                pending.Push(child);
            }
        }

        return ids;
    }
}
