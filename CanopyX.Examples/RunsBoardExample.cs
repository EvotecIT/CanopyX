using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// One page with a tree whose pipelines are group rows above their runs, and the flat runs grid with its filter builder:
/// the stylesheets of both, and of the filter editor part the grid loads, share the page without restyling each other.
/// </summary>
internal static class RunsBoardExample {
    private static readonly string[] Pipelines = { "Nightly build", "Release candidate", "Security scan", "Docs publish" };

    internal static void Write(string output) {
        var options = new CanopyHtmlOptions { Height = "360px", Document = new CanopyHtmlDocument() };
        // Grouped conditions bring the reporting runtime; its filter builder nests a block per group.
        var runs = RunsGridExample.Create();
        runs.Reporting = new CanopyGridReporting { FilterGroups = true };
        var page = "<!DOCTYPE html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n" +
            "<title>Pipeline board</title><style>" + CanopyHtmlAssets.GetStyle(CanopyRuntime.ReportingGrid) + "</style><script>" +
            CanopyHtmlAssets.GetScript(CanopyRuntime.ReportingGrid) + "</script>\n" +
            "<style>body { margin:0; padding:16px; color-scheme:light dark; background:Canvas; color:CanvasText; font-family:system-ui,\"Segoe UI\",sans-serif; } h2 { font-size:15px; margin:16px 0 8px; }</style></head>\n" +
            "<body><main>\n<h2>Pipelines</h2>\n" + Board().ToHtmlFragment(options) + "\n<h2>Runs</h2>\n" + runs.ToHtmlFragment(options) +
            "\n</main></body></html>\n";
        File.WriteAllText(Path.Combine(output, "runs-board.html"), page);
    }

    /// <summary>Each pipeline is a group row whose children are its last runs.</summary>
    internal static CanopyTreeView Board() {
        var view = new CanopyTreeView("board", "Pipelines");
        view.Columns.Add(new CanopyColumn("name", "Pipeline or run"));
        view.Columns.Add(new CanopyColumn("result", "Result"));
        view.Columns.Add(new CanopyColumn("duration", "Duration (min)") { Kind = CanopyColumnKind.Number });
        for (var p = 0; p < Pipelines.Length; p++) {
            var pipeline = new CanopyNode("pipeline-" + p, Pipelines[p]) { Group = true, Expanded = true };
            for (var r = 0; r < 3; r++) {
                var run = new CanopyNode(pipeline.Id + "-run-" + r, Pipelines[p] + " #" + (100 + p + r * 4));
                run.Cells["result"] = (p + r) % 5 == 0 ? "Failed" : "Passed";
                run.Cells["duration"] = 4 + (p * 7 + r * 3) % 23;
                pipeline.Children.Add(run);
            }
            view.Roots.Add(pipeline);
        }
        return view;
    }
}
