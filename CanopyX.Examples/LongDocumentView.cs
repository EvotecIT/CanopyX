using System.Globalization;

namespace CanopyX.Examples;

/// <summary>Defines tall document sections whose loaded range exceeds native browser element heights.</summary>
internal static class LongDocumentView {
    internal static CanopyView Create() {
        var view = new CanopyView("long-document", "Long document") { PageSize = 10000, RowHeight = 64 };
        view.Columns.Add(new CanopyColumn("name", "Section") { Width = 600 });
        for (var i = 0; i < 20000; i++) {
            var number = i.ToString(CultureInfo.InvariantCulture);
            view.Roots.Add(new CanopyNode("section-" + number, "Section " + number) {
                Detail = new CanopyHtmlDetail("<div class=\"section-card\"><p>Start of section " + number +
                    "</p><p>Middle of section " + number + "</p><p>End of section " + number + "</p></div>") { Height = 40 }
            });
        }
        return view;
    }
}
