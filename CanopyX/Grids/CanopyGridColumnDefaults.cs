using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Column settings selected by identity, authored class, index or wildcard. Earlier matching rules win per setting.</summary>
public sealed class CanopyGridColumnDefaults {
    /// <summary>Gets selectors: *, #column-id, .authored-class or index:N (zero-based).</summary>
    public IList<string> Targets { get; } = new List<string>();
    /// <summary>Gets or sets safe column CSS classes; null leaves this setting unspecified.</summary>
    public string? ClassName { get; set; }
    /// <summary>Gets or sets start, center or end alignment; null leaves it unspecified.</summary>
    public string? Alignment { get; set; }
    /// <summary>Gets or sets whether matching columns can sort.</summary>
    public bool? Sortable { get; set; }
    /// <summary>Gets or sets whether matching columns can filter.</summary>
    public bool? Filterable { get; set; }
    /// <summary>Gets or sets whether matching columns start hidden.</summary>
    public bool? Hidden { get; set; }
    /// <summary>Gets or sets raw columns used to sort matching columns; null leaves it unspecified.</summary>
    public IList<string>? OrderData { get; set; }
    /// <summary>Gets or sets the asc, desc, none direction cycle; null leaves it unspecified.</summary>
    public IList<string>? OrderSequence { get; set; }
    /// <summary>Gets or sets a named plugin comparator; null leaves it unspecified.</summary>
    public string? SortComparator { get; set; }

    internal void Validate(IList<CanopyColumn> columns) {
        if (Targets.Count == 0 || Targets.Count > 64 || Targets.Any(target => !ValidTarget(target, columns))) throw new InvalidOperationException("Column defaults require valid wildcard, identity, class or index selectors.");
        var check = new CanopyColumn("defaults", "Defaults") { ClassName = ClassName, Alignment = Alignment, SortComparator = SortComparator };
        if (OrderData != null) check.OrderData = OrderData;
        if (OrderSequence != null) check.OrderSequence = OrderSequence;
        check.ValidateGridDefaults(columns);
    }
    private static bool ValidTarget(string? target, IList<CanopyColumn> columns) {
        if (target == "*") return true;
        if (string.IsNullOrEmpty(target)) return false;
        if (target![0] == '#') return columns.Any(column => column.Id == target.Substring(1));
        if (target[0] == '.') {
            try { CanopyColumn.ValidateClassName(target.Substring(1)); return target.IndexOf(' ') < 0; }
            catch (ArgumentException) { return false; }
        }
        return target.StartsWith("index:", StringComparison.Ordinal) && int.TryParse(target.Substring(6), NumberStyles.None, CultureInfo.InvariantCulture, out var index) && index >= 0 && index < columns.Count;
    }
    internal bool Matches(CanopyColumn column, int index) => Targets.Any(target => target == "*" || target == "#" + column.Id ||
        target == "index:" + index.ToString(CultureInfo.InvariantCulture) || target.StartsWith(".", StringComparison.Ordinal) &&
        (column.DeclaredClassName ?? string.Empty).Split(' ').Contains(target.Substring(1), StringComparer.Ordinal));

    internal void Fill(CanopyGridColumnDefaults rule) {
        ClassName ??= rule.ClassName; Alignment ??= rule.Alignment; Sortable ??= rule.Sortable; Filterable ??= rule.Filterable;
        Hidden ??= rule.Hidden; OrderData ??= rule.OrderData == null ? null : new List<string>(rule.OrderData);
        OrderSequence ??= rule.OrderSequence == null ? null : new List<string>(rule.OrderSequence); SortComparator ??= rule.SortComparator;
    }
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("targets").BeginArray(); foreach (var target in Targets) writer.String(target); writer.EndArray();
        writer.OptionalProperty("className", ClassName).OptionalProperty("alignment", Alignment).OptionalProperty("sortComparator", SortComparator);
        if (Sortable.HasValue) writer.Property("sortable", Sortable.Value);
        if (Filterable.HasValue) writer.Property("filterable", Filterable.Value);
        if (Hidden.HasValue) writer.Property("hidden", Hidden.Value);
        if (OrderData != null) { writer.Name("orderData").BeginArray(); foreach (var id in OrderData) writer.String(id); writer.EndArray(); }
        if (OrderSequence != null) { writer.Name("orderSequence").BeginArray(); foreach (var direction in OrderSequence) writer.String(direction); writer.EndArray(); }
        writer.EndObject();
    }
}
