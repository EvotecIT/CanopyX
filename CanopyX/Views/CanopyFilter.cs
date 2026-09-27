using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// An "only matching" switch in the toolbar that keeps nodes carrying a host flag and the ancestors of those nodes.
/// </summary>
/// <remarks>
/// A node matches when its <see cref="CanopyNode.Flags"/> contain <see cref="Flag"/>; a matching node keeps its whole
/// subtree. A node that does not match stays visible, with its children filtered, when a loaded descendant matches or
/// when it carries <see cref="AncestorFlag"/>. The ancestor flag lets hosts keep collapsed branches whose children
/// are not loaded yet, because the runtime never walks unloaded data.
/// </remarks>
public sealed class CanopyFilter {
    /// <summary>Creates a filter.</summary>
    /// <param name="id">The filter id, unique within the view.</param>
    /// <param name="label">The switch label, for example "Only changed".</param>
    /// <param name="flag">The node flag that makes a node match.</param>
    /// <exception cref="ArgumentException">An argument is null or empty, or the accessible label is whitespace.</exception>
    public CanopyFilter(string id, string label, string flag) {
        if (string.IsNullOrEmpty(id)) {
            throw new ArgumentException("Filter id is required.", nameof(id));
        }

        if (string.IsNullOrWhiteSpace(label)) {
            throw new ArgumentException("Filter label is required.", nameof(label));
        }

        if (string.IsNullOrEmpty(flag)) {
            throw new ArgumentException("Filter flag is required.", nameof(flag));
        }

        Id = id;
        Label = label;
        Flag = flag;
    }

    /// <summary>Gets the filter id.</summary>
    public string Id { get; }

    /// <summary>Gets the switch label.</summary>
    public string Label { get; }

    /// <summary>Gets the node flag that makes a node match.</summary>
    public string Flag { get; }

    /// <summary>Gets or sets the node flag that keeps a non-matching node visible as an ancestor of matches.</summary>
    public string? AncestorFlag { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("label", Label).Property("flag", Flag);
        writer.OptionalProperty("ancestorFlag", string.IsNullOrEmpty(AncestorFlag) ? null : AncestorFlag);
        writer.EndObject();
    }
}
