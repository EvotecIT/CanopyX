using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// The flow test bench: the retire-servers flow on a page that carries every flow part, so the browser specs can mount flow
/// documents of their own (checks, host options, records, pick steps, task lists, dialogs, the command, drafts, deep links,
/// an endpoint, the consent) on a page written as one file. A real page carries only the parts its flow names.
/// </summary>
internal static class FlowWorkbenchExample {
    internal static void Write(string output) {
        var parts = CanopyHtmlAssets.Parts.Where(part => part.Name.StartsWith("flow", StringComparison.Ordinal)).Select(part => part.Name).ToList();
        FlowExamplePage.Write(output, "flow-workbench", FlowActOnRowsExample.Flow(), "Flow test bench", width: 860, dark: false, parts: parts);
    }
}