using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Page-scroll headers and literal card token slots authored through the grid definition.</summary>
internal static class GridPolishExample {
    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            var view = View();
            view.StickyHeader = true;
            var page = view.ToHtmlPage(new CanopyHtmlOptions { Theme = theme, Height = "2600px", Title = "Work schedule with a page-scroll header" });
            const string pageStyle = "<style>html body.cx-page{height:auto;overflow:visible;color:CanvasText;background:Canvas}.cx-main{height:auto;display:block;padding:24px}body.cx-page>.cx-main>.cx-host{height:2600px}.polish-copy{max-width:60rem;margin:0 0 24px;line-height:1.6}</style>";
            const string introduction = "<section class=\"polish-copy\"><h2>Work schedule</h2><p>Scroll the page: the grid header stays in view while this auto-height schedule fits every record. Sort the Name column from the header as usual.</p></section>";
            page = page.Replace("</head>", pageStyle + "</head>").Replace("<main class=\"cx-main\">", "<main class=\"cx-main\">" + introduction);
            File.WriteAllText(Path.Combine(output, "sticky-grid" + suffix + ".html"), page);

            view = CardsView();
            view.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Cards };
            view.CardTemplate = new CanopyCardTemplate();
            view.CardTemplate.Slots.Add("name", "{name}");
            view.CardTemplate.Slots.Add("due", "{due}");
            view.SaveHtmlPage(Path.Combine(output, "template-cards" + suffix + ".html"),
                new CanopyHtmlOptions { Theme = theme, Title = "Work item cards with safe token slots", Height = "720px" });
        }
    }

    private static CanopyDataGridView CardsView() {
        var view = View();
        view.GetColumn("status").Presenter = CanopyGridPresenter.Enum();
        view.Columns.Insert(2, new CanopyColumn("owner", "Owner") { Sizing = CanopyColumnSizing.Preferred(160) });
        view.Columns.Insert(3, new CanopyColumn("team", "Team") { Sizing = CanopyColumnSizing.Preferred(160) });
        view.Columns.Insert(4, new CanopyColumn("priority", "Priority") { Sizing = CanopyColumnSizing.Preferred(120) });
        for (var index = 0; index < view.Rows.Count; index++) {
            var row = view.Rows[index];
            row.Cells["status"] = new CanopyCell(index % 3 == 0 ? "Needs review" : "Scheduled") { Tone = index % 3 == 0 ? CanopyTone.Warning : CanopyTone.Info };
            row.Cells["owner"] = new[] { "Alex Morgan", "Sam Rivera", "Jordan Lee", "Casey Taylor" }[index % 4];
            row.Cells["team"] = new[] { "Platform", "Customer success", "Operations" }[index % 3];
            row.Cells["priority"] = index % 4 == 0 ? "High" : "Normal";
        }
        return view;
    }

    private static CanopyDataGridView View() {
        var view = new CanopyDataGridView("work-items", "Work items") { PageSize = 100, AllowRegexSearch = true };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true, Sizing = CanopyColumnSizing.Preferred(240) });
        view.Columns.Add(new CanopyColumn("status", "Status") { Sizing = CanopyColumnSizing.Preferred(140) });
        view.Columns.Add(new CanopyColumn("due", "Due") { Kind = CanopyColumnKind.DateTime, Sizing = CanopyColumnSizing.Preferred(180) });
        for (var index = 0; index < 40; index++) {
            var row = new CanopyGridRow("item-" + index.ToString("D3", CultureInfo.InvariantCulture));
            row.Cells["name"] = "Item " + (index + 1).ToString(CultureInfo.InvariantCulture);
            row.Cells["status"] = index % 3 == 0 ? "Needs review" : "Scheduled";
            row.Cells["due"] = new DateTime(2026, 11, 1, 9, 0, 0, DateTimeKind.Utc).AddDays(index);
            view.Rows.Add(row);
        }
        return view;
    }
}
