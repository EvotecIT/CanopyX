using System.Text;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>Three host-provided service snapshots replayed as a matrix and a propagation view, with static fallbacks.</summary>
internal static class TimeSliderExample {
    private static readonly DateTimeOffset Start = new(2026, 10, 25, 10, 0, 0, TimeSpan.Zero);
    private static readonly string[] Services = { "API", "Search", "Cache" };

    internal static void Write(string output) {
        Directory.CreateDirectory(output);
        var matrix = Matrix(2);
        var propagation = Propagation(2);
        matrix.TimeSlider = new CanopyTimeSlider<CanopyMatrix> { InitialIndex = 0, IntervalMilliseconds = 1500 };
        propagation.TimeSlider = new CanopyTimeSlider<CanopyPropagation> { InitialIndex = 0, IntervalMilliseconds = 1500 };
        for (var i = 0; i < 3; i++) {
            var label = i == 0 ? "Rollout started" : i == 1 ? "Update spreading" : "All services ready";
            matrix.TimeSlider.Snapshots.Add(new(Start.AddMinutes(i), Matrix(i), label));
            propagation.TimeSlider.Snapshots.Add(new(Start.AddMinutes(i), Propagation(i), label));
        }

        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            matrix.SaveHtmlPage(Path.Combine(output, "time-matrix" + suffix + ".html"), new CanopyHtmlOptions { Title = "Service health over time", Theme = theme });
            propagation.SaveHtmlPage(Path.Combine(output, "time-propagation" + suffix + ".html"), new CanopyHtmlOptions { Title = "Service rollout over time", Theme = theme });
        }

        WriteStatic(output, "time-matrix-static.html", "Service health snapshot", CanopyStaticHtml.RenderMatrix(matrix));
        WriteStatic(output, "time-propagation-static.html", "Service rollout snapshot", CanopyStaticHtml.RenderPropagation(propagation));
    }

    private static CanopyMatrix Matrix(int frame) {
        var view = new CanopyMatrix("time-services", "Service health over time");
        view.State("waiting", "Waiting", CanopyTone.Warning, CanopyMatrixSymbol.Clock, attention: true)
            .State("ready", "Ready", CanopyTone.Success, CanopyMatrixSymbol.Check);
        view.Rows.Title = "Service";
        view.Columns.Title = "Region";
        view.Columns.Item("east", "East").Item("west", "West");
        for (var i = 0; i < Services.Length; i++) {
            var id = "service-" + i;
            view.Rows.Item(id, Services[i]);
            view.Set(id, "east", i <= frame ? "ready" : "waiting");
            view.Set(id, "west", frame == 2 || i < frame ? "ready" : "waiting");
        }

        return view;
    }

    private static CanopyPropagation Propagation(int frame) {
        var view = new CanopyPropagation("time-rollout", "Service rollout over time") {
            Start = Start,
            AsOf = Start.AddMinutes(frame),
            Title = "Service",
            Summary = (frame + 1) + " of 3 services received the update"
        };
        for (var i = 0; i < Services.Length; i++) {
            var received = i <= frame;
            var witness = view.Witness("service-" + i, Services[i], received ? CanopyPropagationState.Converged : CanopyPropagationState.Propagating);
            witness.LastSeen = Start.AddMinutes(frame);
            if (received) witness.FirstSeen = Start.AddMinutes(i);
            witness.Source = i == 0;
        }

        return view;
    }

    private static void WriteStatic(string output, string file, string title, string table) {
        var page = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>" + title +
            "</title></head><body style=\"font-family:Calibri,Arial,sans-serif;margin:16px\">" + table + "</body></html>";
        File.WriteAllText(Path.Combine(output, file), page, new UTF8Encoding(false));
    }
}
