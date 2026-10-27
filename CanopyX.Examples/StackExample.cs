using System.Text;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>A configuration-layer explanation whose order, winner and reasons are supplied entirely by the host.</summary>
internal static class StackExample {
    internal static void Write(string output) {
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            Create().SaveHtmlPage(Path.Combine(output, "stack" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"),
                new CanopyHtmlOptions { Title = "Configuration layers", Theme = theme, Height = "820px" });
        }
        var html = CanopyStaticHtml.RenderGrid(Create());
        File.WriteAllText(Path.Combine(output, "stack-static.html"),
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Configuration layers</title></head><body>" + html + "</body></html>",
            new UTF8Encoding(false));
    }

    internal static CanopyDataGridView Create() {
        var view = new CanopyDataGridView("configuration-stack", "Configuration layers") {
            RowIdentity = CanopyGridRowIdentity.StableKey, Record = new CanopyRecordPanel(), Stack = new CanopyStack()
        };
        view.Columns.Add(new CanopyColumn("title", "Configuration") { RowHeader = true, Wrap = true });
        view.Columns.Add(new CanopyColumn("value", "Configured value"));
        view.Columns.Add(new CanopyColumn("scope", "Scope"));
        view.Rows.Add(Record("defaults", "Shared defaults", "Standard", "All environments"));
        view.Rows.Add(Record("workspace", "Workspace configuration", "Extended", "Current workspace"));
        view.Rows.Add(Record("environment", "Environment configuration", "Extended", "Current environment"));
        view.Rows.Add(Record("session", "Session configuration", "Compact", "Current session"));
        view.Rows.Add(Record("preview", "Preview configuration with a longer descriptive name", "Experimental", "Preview sessions"));
        view.Stack.Layers.Add(new CanopyStackLayer("defaults", "defaults", "Provides the starting value shown in this explanation.") { Label = "Shared baseline" });
        view.Stack.Layers.Add(new CanopyStackLayer("workspace", "workspace", "The host reports a workspace-specific value at this stage.") {
            Label = "Workspace", Badges = { new CanopyBadge("Reviewed", CanopyTone.Info) }
        });
        view.Stack.Layers.Add(new CanopyStackLayer("environment", "environment", "Retained as an enforced layer by the host; it is not the selected result.") { Enforced = true });
        view.Stack.Layers.Add(new CanopyStackLayer("session", "session", "The host selected this layer as the effective configuration for this session.") {
            Winner = true, Badges = { new CanopyBadge("Effective value: Compact", CanopyTone.Success) }
        });
        view.Stack.Layers.Add(new CanopyStackLayer("preview", "preview", "Excluded by the host because this session is outside the preview scope.") { Filtered = true });
        view.Stack.Layers.Add(new CanopyStackLayer("baseline-review", "defaults", "The same baseline record is referenced again for the host's final review context.") { Label = "Final context" });
        return view;
    }

    private static CanopyGridRow Record(string id, string title, string value, string scope) => new CanopyGridRow(id) {
        Cells = { ["title"] = title, ["value"] = value, ["scope"] = scope }
    };
}
