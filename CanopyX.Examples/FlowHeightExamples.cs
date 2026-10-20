using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>Flow hosts with explicit and natural heights, including the nonce-based style rule used by strict CSP hosts.</summary>
internal static class FlowHeightExamples {
    internal static void Write(string output) {
        var folder = Path.Combine(output, "flow-height");
        Directory.CreateDirectory(folder);
        foreach (var nonce in new[] { false, true }) {
            foreach (var explicitHeight in new[] { false, true }) {
                var options = new CanopyHtmlOptions {
                    Height = explicitHeight ? "600px" : null,
                    Nonce = nonce ? "flow-height-example" : null,
                    Theme = CanopyTheme.Light
                };
                var name = (nonce ? "nonce" : "inline") + (explicitHeight ? "-600" : "-auto") + ".html";
                File.WriteAllText(Path.Combine(folder, name), FlowPauseExample.Flow().ToHtmlPage(options));
            }
        }
    }
}
