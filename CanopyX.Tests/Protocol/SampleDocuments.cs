namespace CanopyX.Tests.Protocol;

/// <summary>
/// Documents that use every field of the protocol, so schema tests cover the whole writer surface.
/// </summary>
internal static class SampleDocuments {
    internal const string FolderIcon = "<svg viewBox=\"0 0 16 16\"><path fill=\"currentColor\" d=\"M1 3h5l2 2h7v8H1z\"/></svg>";

    internal static CanopyView FullView(CanopySource? source = null) {
        var view = new CanopyView("files", "File shares") {
            RowHeight = 30,
            PageSize = 50,
            Selection = CanopySelectionMode.Multiple,
            Search = new CanopySearchOptions { MinLength = 2, MaxResults = 25, Placeholder = "Find a file" },
            StateKey = "files-state",
            TimeZone = CanopyTimeZone.Local,
            DeepLink = true
        };
        if (source != null) {
            view.Source = source;
        }

        view.Columns.Add(new CanopyColumn("name", "Name") { Width = 320, Sortable = true });
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("modified", "Modified") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Hidden = true });
        view.Icons["folder"] = FolderIcon;
        view.Filters.Add(new CanopyFilter("changed", "Only changed", "changed") { AncestorFlag = "changed-below" });

        var share = new CanopyNode("share", @"\\files\projects") { Kind = "share", Icon = "folder", Group = true, Expanded = true };
        share.Cells["size"] = 5_368_709_120L;
        share.Cells["owner"] = new CanopyCell("eng") { Text = "Engineering", Title = "Owning team", Tone = CanopyTone.Info };
        share.Badges.Add(new CanopyBadge("3 changed", CanopyTone.Warning) { Title = "Changed in the last 7 days" });
        share.Flags.Add("changed-below");

        var plans = new CanopyNode("share/plans", "plans") { Icon = "folder", ClassName = "host-highlight" };
        plans.Cells["modified"] = new DateTime(2026, 9, 27, 10, 15, 0, DateTimeKind.Utc);
        plans.Cells["size"] = new CanopyCell(1_048_576L) { Badges = { new CanopyBadge("large", CanopyTone.Danger) } };
        plans.Flags.Add("changed");
        plans.Data["position"] = "0-42";
        plans.Data["level"] = "high";
        share.Children.Add(plans);

        var history = new CanopyNode("share/plans/history", "History") { ChildCount = 1 };
        history.Children.Add(new CanopyNode("share/plans/history/r1", "Revision 1") { Kind = "revision" });
        plans.Children.Add(history);

        var diff = new CanopyNode("share/plans/diff", "Changed settings") {
            Detail = new CanopyTableDetail("Revision 12").AddColumns("Setting", "Before", "After")
        };
        ((CanopyTableDetail)diff.Detail).AddRow("Retention", new CanopyCell("30 days") { Tone = CanopyTone.Danger }, new CanopyCell("90 days") { Tone = CanopyTone.Success });
        plans.Children.Add(diff);

        var props = new CanopyNode("share/props", "Properties") { Detail = new CanopyPropertiesDetail { Height = 3 }.Add("Owner", "Engineering").Add("Quota", 10_000) };
        share.Children.Add(props);

        var widget = new CanopyNode("share/widget", "Usage") { Detail = new CanopyHtmlDetail("<div class=\"host-widget\">42%</div>") };
        share.Children.Add(widget);

        view.Roots.Add(share);
        var archive = new CanopyNode("archive", "Archive");
        archive.Children.Add(new CanopyNode("archive/2025", "2025"));
        view.Roots.Add(archive);
        return view;
    }

    internal static CanopyPage Page() {
        var page = new CanopyPage("share/plans/history") { Offset = 100, Total = 240, Next = "cursor-3" };
        for (var index = 100; index < 110; index++) {
            var revision = new CanopyNode("rev-" + index, "Revision " + index) { Kind = "revision", HasChildren = true, ChildCount = 3, Ref = "rev-" + index + "/changes" };
            revision.Cells["modified"] = new DateTimeOffset(2026, 9, 1, 8, 0, 0, TimeSpan.FromHours(2)).AddDays(index);
            page.Items.Add(revision);
        }

        return page;
    }

    internal static CanopySearchResult Search() {
        var result = new CanopySearchResult("pla") { Total = 40, Truncated = true };
        result.Hits.Add(new CanopySearchHit(new[] { "share", "share/plans" }, "plans") { Kind = "folder", Context = @"\\files\projects" });
        result.Hits.Add(new CanopySearchHit(new[] { "archive" }, "Archive"));
        return result;
    }

    internal static CanopyCounts Counts() {
        var counts = new CanopyCounts();
        var entry = new CanopyCountEntry("share") { ChildCount = 13, Flags = new List<string> { "changed-below" } };
        entry.Cells["size"] = 5_400_000_000L;
        counts.Items.Add(entry);
        counts.Items.Add(new CanopyCountEntry("archive") { ChildCount = 0 });
        return counts;
    }
}
