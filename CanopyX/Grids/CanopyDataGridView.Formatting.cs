using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets the conditional formatting rules, at most 64, in priority order (docs/conditional-formatting.md).</summary>
    /// <remarks>
    /// The browser's formatting part evaluates them on the rows it has and the static renderer on the rows it writes. A grid with
    /// rules, or with <see cref="Formatting"/>, carries the formatting part (and the rule editor when it is enabled) in single-file pages.
    /// </remarks>
    public IList<CanopyFormatRule> FormatRules { get; } = new List<CanopyFormatRule>();

    /// <summary>Gets or sets the legend and rule editor options, or null for neither.</summary>
    public CanopyFormatOptions? Formatting { get; set; }

    internal bool HasFormatting => FormatRules.Count > 0 || Formatting != null;

    private void WriteFormattingJson(CanopyJsonWriter writer) {
        if (FormatRules.Count > 0) {
            writer.Name("formatRules").BeginArray();
            foreach (var rule in FormatRules) rule.WriteJson(writer);
            writer.EndArray();
        }
        if (Formatting != null) { writer.Name("formatting"); Formatting.WriteJson(writer); }
    }

    private void ValidateFormatting() {
        if (FormatRules.Count > 64) throw new InvalidOperationException("A grid supports at most 64 formatting rules.");
        var columns = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in Columns) columns[column.Id] = column;
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var rule in FormatRules) {
            if (rule == null || !ids.Add(rule.Id)) throw new InvalidOperationException("Formatting rules need unique identifiers and cannot be null.");
            rule.Validate(columns);
        }
    }
}
