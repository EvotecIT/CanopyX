using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>A validated date-range request: the records of a complete query that overlap a UTC window, ordered by start.</summary>
/// <remarks>
/// <para>
/// A record without a recurrence (no <see cref="Recurrence"/> column, or a null or empty value) overlaps when
/// <c>start &lt; to</c> and either <c>start &gt;= from</c> or <c>end &gt; from</c>; without an <see cref="End"/> column, or with a
/// null end, it is a zero-length marker at its start and only <c>start &gt;= from</c> counts. A record with a recurrence overlaps
/// when <c>start &lt; to</c> and, with a <see cref="SeriesEnd"/> column, its series end is null or after <c>from</c>. Dates compare
/// as UTC instants at millisecond precision.
/// </para>
/// <para>
/// The query's identity restriction, search, predicates and filter group apply first, then <see cref="Resources"/> (an
/// <c>in</c> predicate on the <see cref="Resource"/> column), then the overlap. The query's window, sort and grouping do not
/// apply: records are ordered by start ascending, then by record identity, and at most <see cref="Limit"/> are returned.
/// <see cref="Selection"/> expresses all of this as an ordinary request, so a provider can answer it with its own filtering,
/// ordering and counting.
/// </para>
/// </remarks>
public sealed class CanopyRangeRequest {
    /// <summary>Creates a range request.</summary>
    /// <param name="query">The complete query whose criteria select the records.</param>
    /// <param name="from">The inclusive window start, a UTC instant (unspecified values are read as UTC).</param>
    /// <param name="to">The exclusive window end, after <paramref name="from"/> and at most 3,700 days later.</param>
    /// <param name="start">The allowed date column holding each record's start.</param>
    /// <param name="end">The allowed date column holding each record's end, or null.</param>
    /// <param name="recurrence">The allowed text column holding each record's recurrence rule, or null.</param>
    /// <param name="seriesEnd">The allowed date column holding the end of a series' last occurrence, or null.</param>
    /// <param name="resource">The allowed text column holding each record's resource identity, or null.</param>
    /// <param name="resources">The resource identities to restrict to (1 to 1,000, unique, nonempty), or null for all; requires
    /// <paramref name="resource"/>.</param>
    /// <param name="limit">The most records to return, at least one.</param>
    /// <param name="calendarView">The informational calendar view name, or null.</param>
    /// <exception cref="ArgumentException">A column belongs to another schema or has the wrong kind, the window is empty or too
    /// long, or the resources are invalid or have no resource column.</exception>
    public CanopyRangeRequest(CanopyDataRequest query, DateTime from, DateTime to, CanopyDataColumn start, CanopyDataColumn? end = null,
        CanopyDataColumn? recurrence = null, CanopyDataColumn? seriesEnd = null, CanopyDataColumn? resource = null, IEnumerable<string>? resources = null,
        int limit = 5000, string? calendarView = null) {
        Query = query ?? throw new ArgumentNullException(nameof(query));
        From = Instant(from, nameof(from));
        To = Instant(to, nameof(to));
        if (From >= To) throw new ArgumentException("A range must end after it starts.", nameof(to));
        if (To - From > TimeSpan.FromDays(3700)) throw new ArgumentException("A range spans at most 3,700 days.", nameof(to));
        Start = Bind(start ?? throw new ArgumentNullException(nameof(start)), CanopyColumnKind.DateTime, nameof(start))!;
        End = Bind(end, CanopyColumnKind.DateTime, nameof(end));
        Recurrence = Bind(recurrence, CanopyColumnKind.Text, nameof(recurrence));
        SeriesEnd = Bind(seriesEnd, CanopyColumnKind.DateTime, nameof(seriesEnd));
        Resource = Bind(resource, CanopyColumnKind.Text, nameof(resource));
        if (resources != null) {
            if (Resource == null) throw new ArgumentException("A resource restriction needs the resource column.", nameof(resources));
            var list = new List<string>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in resources) {
                if (string.IsNullOrEmpty(item)) throw new ArgumentException("Resource identities cannot be empty.", nameof(resources));
                if (!seen.Add(item)) throw new ArgumentException("Resource identities must be unique.", nameof(resources));
                list.Add(item);
            }
            if (list.Count == 0 || list.Count > 1000) throw new ArgumentException("A resource restriction lists 1 to 1,000 identities.", nameof(resources));
            Resources = new ReadOnlyCollection<string>(list);
        }
        if (limit < 1) throw new ArgumentOutOfRangeException(nameof(limit));
        Limit = limit;
        CalendarView = calendarView;
        Selection = BuildSelection();
    }

    /// <summary>Gets the complete query whose criteria select the records; its window, sort and grouping do not apply.</summary>
    public CanopyDataRequest Query { get; }

    /// <summary>Gets the inclusive UTC window start, at millisecond precision.</summary>
    public DateTime From { get; }

    /// <summary>Gets the exclusive UTC window end, at millisecond precision.</summary>
    public DateTime To { get; }

    /// <summary>Gets the date column holding each record's start.</summary>
    public CanopyDataColumn Start { get; }

    /// <summary>Gets the date column holding each record's end, or null when every record is a marker at its start.</summary>
    public CanopyDataColumn? End { get; }

    /// <summary>Gets the text column holding each record's recurrence rule, or null when no record recurs.</summary>
    public CanopyDataColumn? Recurrence { get; }

    /// <summary>Gets the date column holding the end of a recurring record's last occurrence, or null.</summary>
    public CanopyDataColumn? SeriesEnd { get; }

    /// <summary>Gets the text column holding each record's resource identity, or null.</summary>
    public CanopyDataColumn? Resource { get; }

    /// <summary>Gets the resource identities the records are restricted to, or null for no restriction.</summary>
    public IReadOnlyList<string>? Resources { get; }

    /// <summary>Gets the most records to return.</summary>
    public int Limit { get; }

    /// <summary>Gets the calendar view the client reported, for logging and host decisions only; it never changes the answer.</summary>
    public string? CalendarView { get; }

    /// <summary>Gets the equivalent ordinary request: the query's search, identity restriction and revision, its filter combined
    /// with the resource restriction and the overlap predicates, sorted by the start column (then record identity), ungrouped,
    /// with the window <c>0..Limit</c>.</summary>
    /// <remarks>Its filter references date columns with typed UTC operands, so a provider evaluates it as it evaluates any other
    /// request. Counting it gives the matching count; reading its window gives the rows.</remarks>
    public CanopyDataRequest Selection { get; }

    private CanopyDataColumn? Bind(CanopyDataColumn? column, CanopyColumnKind kind, string parameter) {
        if (column == null) return null;
        if (!Query.Schema.TryGetColumn(column.Id, out var own) || !ReferenceEquals(own, column)) throw new ArgumentException("The column belongs to another schema.", parameter);
        if (column.Kind != kind) throw new ArgumentException("The column must be a " + kind + " column.", parameter);
        return column;
    }

    private static DateTime Instant(DateTime value, string parameter) {
        var utc = CanopyDataValues.TruncateToMilliseconds(value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc));
        if (utc.Year < 2 || utc.Year > 9998) throw new ArgumentOutOfRangeException(parameter, "A range instant must fall between the years 0002 and 9998.");
        return utc;
    }

    private CanopyDataRequest BuildSelection() {
        var resources = Resources == null ? null : new CanopyFilterCondition(Resource!, CanopyGridFilterOperator.In, Resources);
        var selection = new CanopyDataRequest(Query.Schema, CanopyFilters.All(Query.Filter, resources, Overlap()), new[] { new CanopySortKey(Start, false) },
            Query.Search, Query.SearchMode, 0, Limit, Query.Revision, Array.Empty<CanopySummaryLevel>());
        return Query.Ids != null || Query.ExcludedIds.Count != 0 ? selection.WithIdentities(Query.Ids, Query.ExcludedIds) : selection;
    }

    /// <summary>The overlap of the window as filter nodes over the start, end, recurrence and series-end columns.</summary>
    private CanopyFilterNode Overlap() {
        CanopyFilterNode Test(CanopyDataColumn column, CanopyGridFilterOperator op, params object[] values) => new CanopyFilterCondition(column, op, values);
        var before = Test(Start, CanopyGridFilterOperator.LessThan, To);
        var startsInside = Test(Start, CanopyGridFilterOperator.GreaterThanOrEqual, From);
        var single = End == null ? startsInside : new CanopyFilterGroup(CanopyGridFilterJunction.Any, new[] { startsInside, Test(End, CanopyGridFilterOperator.GreaterThan, From) });
        if (Recurrence == null) return new CanopyFilterGroup(CanopyGridFilterJunction.All, new[] { before, single });
        var none = new CanopyFilterGroup(CanopyGridFilterJunction.Any, new[] { Test(Recurrence, CanopyGridFilterOperator.IsNull), Test(Recurrence, CanopyGridFilterOperator.Equal, string.Empty) });
        var recurs = new List<CanopyFilterNode> { Test(Recurrence, CanopyGridFilterOperator.IsNotNull), Test(Recurrence, CanopyGridFilterOperator.NotEqual, string.Empty) };
        if (SeriesEnd != null)
            recurs.Add(new CanopyFilterGroup(CanopyGridFilterJunction.Any, new[] { Test(SeriesEnd, CanopyGridFilterOperator.IsNull), Test(SeriesEnd, CanopyGridFilterOperator.GreaterThan, From) }));
        var either = new CanopyFilterGroup(CanopyGridFilterJunction.Any, new CanopyFilterNode[] {
            new CanopyFilterGroup(CanopyGridFilterJunction.All, new[] { none, single }), new CanopyFilterGroup(CanopyGridFilterJunction.All, recurs) });
        return new CanopyFilterGroup(CanopyGridFilterJunction.All, new CanopyFilterNode[] { before, either });
    }
}
