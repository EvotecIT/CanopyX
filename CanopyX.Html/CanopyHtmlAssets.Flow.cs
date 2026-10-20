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

    /// <summary>Gets the entry point required to render a flow: the slim flow entry point, which carries no grid code.</summary>
    /// <param name="flow">The flow.</param>
    /// <returns><see cref="CanopyRuntime.Flow"/>.</returns>
    /// <remarks>The data-grid entry points know the flow parts too, so a grid page can also host a flow (<c>CanopyX.createFlow</c>).</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> is null.</exception>
    public static CanopyRuntime GetRuntime(CanopyFlow flow) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        return CanopyRuntime.Flow;
    }

    /// <summary>Gets the parts a flow loads, whose payloads a single-file page carries: the flow part and the forms part it requires.</summary>
    /// <param name="flow">The flow.</param>
    /// <returns>The parts, in manifest order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="flow"/> is null.</exception>
    public static IReadOnlyList<CanopyHtmlPart> GetRequiredParts(CanopyFlow flow) {
        if (flow == null) throw new ArgumentNullException(nameof(flow));
        return WithRequired(Parts.Where(part => part.IsNeededBy(flow)));
    }
}