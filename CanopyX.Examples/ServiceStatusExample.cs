using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A status board of generic services: enum pills in every tone (a host tone among them), untoned values as plain text in
/// the normal colour next to them, and link rows whose links a host can route through <c>canopyx:link</c>.
/// </summary>
internal static class ServiceStatusExample {
    private static readonly string[] States = { "up", "down", "degraded", "planned", "maintenance", "verified", "retired", "up" };

    internal static void Write(string output) {
        foreach (var theme in new[] { ThemeMode.Light, ThemeMode.Dark })
            Create().Save(Path.Combine(output, "service-status" + (theme == ThemeMode.Dark ? "-dark" : string.Empty) + ".html"),
                new CanopyHtmlOptions { Title = "Service status", Theme = theme });
    }

    internal static CanopyDataGridView Create() {
        var view = new CanopyDataGridView("service-status", "Service status") { RowAction = CanopyGridRowAction.Link, Selection = CanopySelectionMode.Single };
        view.Columns.Add(new CanopyColumn("name", "Service") { Presenter = CanopyGridPresenter.Link("address") });
        var tones = new Dictionary<string, Tone> {
            ["up"] = Tone.Success, ["down"] = Tone.Danger, ["degraded"] = Tone.Warning, ["verified"] = Tone.Info,
            ["maintenance"] = Tone.Named("maintenance")
        };
        // Values without a tone ("planned", "retired") are ordinary states: plain text in the normal colour, aligned with the pills.
        view.Columns.Add(new CanopyColumn("state", "State") {
            Presenter = CanopyGridPresenter.Enum(tones).WithQuietTones(Tone.Neutral).WithQuietStyle(CanopyGridQuietStyle.Plain)
        });
        view.Columns.Add(new CanopyColumn("owner", "Owner"));
        view.Columns.Add(new CanopyColumn("address", "Address") { Hidden = true });
        for (var i = 0; i < 16; i++) {
            var row = new CanopyGridRow("service-" + i.ToString("00", System.Globalization.CultureInfo.InvariantCulture));
            row.Cells["name"] = "service-" + i.ToString("00", System.Globalization.CultureInfo.InvariantCulture);
            row.Cells["state"] = States[i % States.Length];
            row.Cells["owner"] = i % 2 == 0 ? "Platform" : "Messaging";
            row.Cells["address"] = "https://status.example.com/services/" + i;
            view.Rows.Add(row);
        }
        return view;
    }
}
