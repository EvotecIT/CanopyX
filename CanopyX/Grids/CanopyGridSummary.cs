using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Revisioned full-query aggregates and optional flat grouping metadata, independent of cached pages.</summary>
public sealed class CanopyGridSummary {
    /// <summary>Creates summary metadata for the complete accepted query.</summary>
    /// <param name="query">Full-query request with its accepted revision and zero offset.</param>
    /// <param name="matched">Record count after filtering and before paging or presentation collapse.</param>
    public CanopyGridSummary(CanopyGridQuery query, int matched) {
        if (query == null) throw new ArgumentNullException(nameof(query));
        CanopyIdentifiers.Require(query.Revision, nameof(query));
        if (query.Offset != 0 || query.Cursor != null) throw new ArgumentException("A summary query starts at zero and has no cursor.", nameof(query));
        if (matched < 0) throw new ArgumentOutOfRangeException(nameof(matched));
        Query = query; View = query.View; Revision = query.Revision!; Matched = matched;
    }
    /// <summary>Gets the exact accepted query echoed by the response. Mutation is checked before writing.</summary>
    public CanopyGridQuery Query { get; }
    /// <summary>Gets the owning view identity.</summary>
    public string View { get; }
    /// <summary>Gets the dataset snapshot identity.</summary>
    public string Revision { get; }
    /// <summary>Gets the full matching record count.</summary>
    public int Matched { get; }
    /// <summary>Gets ordered groups covering every matched record. At most 10,000 groups are supported.</summary>
    public IList<CanopyGridGroup> Groups { get; } = new List<CanopyGridGroup>();
    /// <summary>Gets full-query raw numeric aggregates keyed by declared aggregate identity.</summary>
    public IDictionary<string, double?> Aggregates { get; } = new Dictionary<string, double?>(StringComparer.Ordinal);
    /// <summary>Writes validated HTML-safe <c>gridSummary</c> metadata, bounded to four million UTF-16 code units.</summary>
    /// <param name="view">The matching reporting definition.</param>
    /// <returns>Full-query summary metadata. Host code owns query evaluation and domain facts.</returns>
    public string ToJson(CanopyGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        Query.Validate(view);
        if (Query.Revision != Revision || Query.Offset != 0 || Query.Cursor != null || Query.Limit != view.PageSize)
            throw new InvalidOperationException("Summary query ownership cannot change after construction.");
        var reporting = view.Reporting;
        if (view.Id != View || reporting == null || reporting.Grouping == null && reporting.Aggregates.Count == 0)
            throw new InvalidOperationException("Summary metadata needs its owning opted-in reporting view.");
        if (Groups.Count > 10000 || (long)Matched + Groups.Count > int.MaxValue || reporting.Grouping == null && Groups.Count != 0)
            throw new InvalidOperationException("Summary metadata supports at most 10,000 declared groups.");
        CanopyColumn? column = null;
        foreach (var declared in view.Columns) if (declared.Id == reporting.Grouping?.Column) column = declared;
        var keys = new HashSet<string>(StringComparer.Ordinal); long offset = 0;
        var compare = reporting.Grouping?.CreateComparer(view); CanopyGridGroup? previous = null;
        foreach (var group in Groups) {
            if (group == null || !keys.Add(group.Key) || group.Offset != offset)
                throw new InvalidOperationException("Groups need unique stable keys and contiguous complete-query ranges.");
            CanopyGridValues.Validate(group.Value?.Value, column!);
            if (previous != null && compare!.Compare(previous.Value!, group.Value!) >= 0)
                throw new InvalidOperationException("Groups must follow declared raw ordering without duplicate values.");
            previous = group;
            offset += group.Count;
            if (offset > Matched) throw new InvalidOperationException("Group ranges exceed the matching record count.");
        }
        if (reporting.Grouping != null && offset != Matched)
            throw new InvalidOperationException("Group ranges must account for every matching record.");
        var writer = new CanopyJsonWriter();
        writer.BeginObject().Envelope("gridSummary").Property("view", View).Property("revision", Revision).Property("matched", Matched);
        writer.Name("query"); Query.WriteJson(writer, view);
        WriteAggregates(writer, Aggregates, view, Matched);
        writer.Name("groups").BeginArray();
        foreach (var group in Groups) group.WriteJson(writer, view);
        var json = writer.EndArray().EndObject().ToString();
        if (json.Length > 4194304) throw new InvalidOperationException("Summary metadata exceeds four million UTF-16 code units.");
        return json;
    }
    internal static void WriteAggregates(CanopyJsonWriter writer, IDictionary<string, double?> values, CanopyGridView view, int count) {
        var declarations = view.Reporting!.Aggregates;
        if (values.Count != declarations.Count) throw new InvalidOperationException("Summary values must match every declared aggregate.");
        writer.Name("aggregates").BeginObject();
        foreach (var aggregate in declarations) {
            if (!values.TryGetValue(aggregate.Id, out var value) || value.HasValue && (double.IsNaN(value.Value) || double.IsInfinity(value.Value) || Math.Abs(value.Value) > 9007199254740991d))
                throw new InvalidOperationException("Aggregate values must be declared finite numbers or null.");
            if (aggregate.Operation == CanopyGridAggregateOperation.Count && (!value.HasValue || value < 0 || value > count || value != Math.Floor(value.Value)))
                throw new InvalidOperationException("A nonmissing-value count must be an integer within its record count.");
            if (count == 0 && aggregate.Operation != CanopyGridAggregateOperation.Count && value.HasValue)
                throw new InvalidOperationException("An empty result has no numeric aggregate value.");
            writer.Name(aggregate.Id); if (value.HasValue) writer.Number(value.Value); else writer.Null();
        }
        writer.EndObject();
    }
}
