using CanopyX.Html;

namespace CanopyX.Examples;

internal static partial class ReportGridLayoutExample {
    private static void WriteHostStyles(string output, CanopyTheme theme) {
        var grid = new CanopyDataGridView<ReviewRecord>("host-style", "Host-styled short enum values", row => row.Id);
        grid.View.Reporting = new CanopyGridReporting();
        grid.View.Selection = CanopySelectionMode.None;
        grid.Column(row => row.Name, "Record");
        grid.Column(row => row.State, "State", column => column.Presenter = CanopyGridPresenter.Enum(new Dictionary<string, CanopyTone> {
            ["Up"] = CanopyTone.Info, ["Down"] = CanopyTone.Danger
        }));
        grid.AddRows(new[] { new ReviewRecord("a", "Branch service", "", "Up", "", 0), new ReviewRecord("b", "Archive service", "", "Down", "", 0) });
        var html = grid.View.ToHtmlPage(new CanopyHtmlOptions { Theme = theme, Height = "360px", Title = "Host styles and overlays" })
            .Replace("</head>", "<style>.report-style .p-pill{font-size:11px;font-weight:500;letter-spacing:1px;padding-inline:16px;border:1px solid currentColor}</style></head>")
            .Replace("</body>", """
                <script>document.addEventListener('DOMContentLoaded',async()=>{
                  const host=document.querySelector('[data-canopyx-host]');await host.canopyx.ready;
                  const view=host.canopyx.view;host.canopyx.destroy();host.replaceChildren();host.classList.add('report-style');
                  host.canopyx=CanopyX.createDataGrid(host,{view,overlayClass:'report-style'});await host.canopyx.ready;
                });</script></body>
                """);
        File.WriteAllText(Path.Combine(output, "report-grid-host-style" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), html);
    }
}
