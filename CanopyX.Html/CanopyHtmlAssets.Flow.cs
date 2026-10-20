using System;
using System.Collections.Generic;
using System.Linq;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The plain file name of the flow entry point's script, which renders forms and guided flows without grid code.</summary>
    public const string FlowScriptFileName = "canopyx-flow-entry.js";

    /// <summary>The plain file name of the flow entry point's stylesheet.</summary>
    public const string FlowStyleFileName = "canopyx-flow-entry.css";

    private static readonly Lazy<string> FlowScriptResource = new(() => CanopyHtmlResources.Read(FlowScriptFileName));
    private static readonly Lazy<string> FlowStyleResource = new(() => CanopyHtmlResources.Read(FlowStyleFileName));
    private static readonly Lazy<string> FlowScriptHash = new(() => Hash(FlowScriptResource.Value));
    private static readonly Lazy<string> FlowStyleHash = new(() => Hash(FlowStyleResource.Value));

    /// <summary>
    /// Gets the entry point required to render a flow: the slim flow entry point, which carries no grid code, unless a pick step
    /// embeds a grid or tree. Then the reporting entry point, whose grids pick with row check boxes.
    /// </summary>
    /// <param name="flow">The flow.</param>
    /// <returns><see cref="CanopyRuntime.Flow"/>, or <see cref="CanopyRuntime.ReportingGrid"/> for a flow with a pick step.</returns>
    /// <remarks>The data-grid entry points know the flow parts too, so a grid page can also host a flow (<c>CanopyX.createFlow</c>).</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> is null.</exception>
    public static CanopyRuntime GetRuntime(CanopyFlow flow) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        foreach (var _ in Pickers(flow)) return CanopyRuntime.ReportingGrid;
        return CanopyRuntime.Flow;
    }

    /// <summary>Gets the parts a flow loads, whose payloads a single-file page carries: the flow part and the forms part it requires,
    /// and the parts of the grids and trees its pick steps embed.</summary>
    /// <param name="flow">The flow.</param>
    /// <returns>The parts, in manifest order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> is null.</exception>
    public static IReadOnlyList<CanopyHtmlPart> GetRequiredParts(CanopyFlow flow) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        var parts = new List<CanopyHtmlPart>(Parts.Where(part => part.IsNeededBy(flow)));
        foreach (var picker in Pickers(flow)) {
            if (picker.GridView != null) parts.AddRange(GetRequiredParts(picker.GridView));
            if (picker.TreeView != null) parts.AddRange(GetRequiredParts(picker.TreeView));
        }

        return WithRequired(parts.Distinct());
    }

    private static IEnumerable<CanopyFlowPicker> Pickers(CanopyFlow flow) {
        foreach (var step in flow.Steps) if (step?.Picker != null) yield return step.Picker;
    }
}