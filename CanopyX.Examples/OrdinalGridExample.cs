using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A materialized event log without a key column; duplicate messages remain distinct records.</summary>
internal static class OrdinalGridExample {
    private sealed record Attempt(DateTimeOffset At, string Message, int Attempts);

    internal static void Write(string output) {
        var grid = new CanopyDataGridView<Attempt>("attempts", "Notification attempts", CanopyGridRowIdentity.Ordinal);
        grid.View.Selection = CanopySelectionMode.None;
        grid.View.RowAction = CanopyGridRowAction.Details;
        grid.Column(row => row.At, "Time", column => column.Sortable = true);
        grid.Column(row => row.Message, configure: column => column.Sortable = true);
        grid.Column(row => row.Attempts, configure: column => column.Sortable = true);
        var time = new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero);
        grid.AddRows(new[] { new Attempt(time, "Retry scheduled", 1), new Attempt(time, "Retry scheduled", 1), new Attempt(time.AddMinutes(5), "Delivered", 2) });
        foreach (var dark in new[] { false, true }) grid.View.SaveHtmlPage(Path.Combine(output, dark ? "ordinal-grid-dark.html" : "ordinal-grid.html"),
            new CanopyHtmlOptions { Title = "Snapshot event log", Theme = dark ? CanopyTheme.Dark : CanopyTheme.Light });
    }
}
