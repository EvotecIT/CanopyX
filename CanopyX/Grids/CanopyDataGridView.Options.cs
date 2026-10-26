using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

public partial class CanopyDataGridView {
    /// <summary>Gets footer rows over the accepted page or complete matching query.</summary>
    public IList<CanopyGridFooter> Footers { get; } = new List<CanopyGridFooter>();
    /// <summary>Gets fixed keys that precede reader sorts, after grouping keys.</summary>
    public IList<CanopyGridSort> PreSort { get; } = new List<CanopyGridSort>();
    /// <summary>Gets ordered column-default rules. Explicit column settings take precedence.</summary>
    /// <remarks>Validation and serialization resolve rules against authored classes; later rule edits are resolved again.</remarks>
    public IList<CanopyGridColumnDefaults> ColumnDefaults { get; } = new List<CanopyGridColumnDefaults>();

    /// <summary>Gets the unique descriptors required by full-query reporting and all-matching footer rows.</summary>
    /// <returns>Descriptors in declaration order. Page-only footers of paged grids do not request full-query summaries; continuous grids use complete matching totals for both scopes.</returns>
    public IReadOnlyList<CanopyGridAggregate> GetSummaryAggregates() {
        var result = new List<CanopyGridAggregate>();
        var ids = new Dictionary<string, CanopyGridAggregate>(StringComparer.Ordinal);
        void Add(CanopyGridAggregate aggregate) {
            if (aggregate == null) throw new InvalidOperationException("An aggregate cannot be null.");
            if (ids.TryGetValue(aggregate.Id, out var existing)) {
                if (existing.Column != aggregate.Column || existing.Operation != aggregate.Operation || existing.CustomOperation != aggregate.CustomOperation)
                    throw new InvalidOperationException("An aggregate identity must describe the same operation and column everywhere.");
                return;
            }
            ids.Add(aggregate.Id, aggregate); result.Add(aggregate);
        }
        if (Reporting != null) foreach (var aggregate in Reporting.Aggregates) Add(aggregate);
        foreach (var footer in Footers) if (footer != null && (footer.Scope == CanopyGridFooterScope.All || Presentation != CanopyGridPresentation.Paged)) foreach (var aggregate in footer.Aggregates) Add(aggregate);
        return result.AsReadOnly();
    }

    private void ApplyColumnDefaults() {
        if (ColumnDefaults.Count > 64) throw new InvalidOperationException("At most 64 column default rules are supported.");
        foreach (var rule in ColumnDefaults) {
            if (rule == null) throw new InvalidOperationException("Column default rules cannot be null.");
            rule.Validate(Columns);
        }
        for (var index = 0; index < Columns.Count; index++) {
            var column = Columns[index];
            if (column == null) continue;
            var defaults = new CanopyGridColumnDefaults();
            foreach (var rule in ColumnDefaults) if (rule.Matches(column, index)) defaults.Fill(rule);
            column.ApplyDefaults(defaults, ColumnDefaults.Count > 0);
        }
    }

    private void ValidateGridOptions() {
        var footerIds = new HashSet<string>(StringComparer.Ordinal);
        if (Footers.Count > 16) throw new InvalidOperationException("At most 16 footer rows are supported.");
        if (Footers.Count > 0 && Navigation == CanopyGridNavigation.Cursor) throw new InvalidOperationException("Footer rows require known-count offset navigation.");
        foreach (var footer in Footers) {
            if (footer == null || !footerIds.Add(footer.Id) || footer.Aggregates.Count == 0 || footer.Aggregates.Count > 32)
                throw new InvalidOperationException("Footers require unique identities and 1 to 32 aggregates.");
            var aggregateIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var aggregate in footer.Aggregates) {
                var column = aggregate == null ? null : Columns.FirstOrDefault(item => item.Id == aggregate.Column);
                if (aggregate == null || column == null || !aggregateIds.Add(aggregate.Id) || aggregate.Numeric && column.Kind != CanopyColumnKind.Number)
                    throw new InvalidOperationException("Footer aggregates require unique identities and declared columns of the appropriate kind.");
            }
        }
        if (GetSummaryAggregates().Count > 32) throw new InvalidOperationException("At most 32 full-query aggregates are supported.");
        var sorted = new HashSet<string>(StringComparer.Ordinal);
        if (PreSort.Count > 32) throw new InvalidOperationException("At most 32 fixed pre-sort keys are supported.");
        foreach (var sort in PreSort) if (sort == null || !Columns.Any(column => column.Id == sort.Column && column.Sortable) || !sorted.Add(sort.Column))
            throw new InvalidOperationException("PreSort requires unique declared sortable columns.");
        foreach (var column in Columns) column.ValidateGridDefaults(Columns);
    }

    private void WriteGridOptions(CanopyJsonWriter writer) {
        if (Footers.Count > 0) { writer.Name("footers").BeginArray(); foreach (var footer in Footers) footer.WriteJson(writer); writer.EndArray(); }
        if (PreSort.Count > 0) { writer.Name("preSort").BeginArray(); foreach (var sort in PreSort) sort.WriteJson(writer); writer.EndArray(); }
        if (ColumnDefaults.Count > 0) { writer.Name("columnDefaults").BeginArray(); foreach (var rule in ColumnDefaults) rule.WriteJson(writer); writer.EndArray(); }
    }
}
