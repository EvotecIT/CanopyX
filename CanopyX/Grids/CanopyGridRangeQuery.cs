using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The <c>gridRangeQuery</c> a hosted source answers when a calendar or timeline shows a period: the records of the complete
/// accepted query that overlap a UTC window, ordered by their start. The answer is a <see cref="CanopyGridRangePage"/>.
/// </summary>
/// <remarks>
/// <para>
/// A record without a recurrence (no <see cref="Recurrence"/> column, or a null or empty value) overlaps when
/// <c>start &lt; to</c> and either <c>start &gt;= from</c> or <c>end &gt; from</c>; a missing end is a zero-length marker at its
/// start. A record with a recurrence overlaps when <c>start &lt; to</c> and, with a <see cref="SeriesEnd"/> column, its series
/// end is missing or after <c>from</c>. <see cref="Resources"/> keeps the records whose resource is one of them, with the
/// semantics of an <c>in</c> predicate on the <see cref="Resource"/> column. The query's search, predicates and filter group
/// apply first; its window, sort and grouping do not.
/// </para>
/// <para>Hosts parse requests with their own JSON reader (the <c>CanopyX.Data</c> package parses and answers them); this type
/// writes the request, for tests, mocks and .NET clients.</para>
/// </remarks>
public sealed class CanopyGridRangeQuery {
    private int _limit = 5000;

    /// <summary>Creates a request for the records that overlap a UTC window.</summary>
    /// <param name="query">The complete accepted query; its window, sort and grouping do not restrict the range.</param>
    /// <param name="start">The date column holding each record's start.</param>
    /// <param name="from">The inclusive window start. Unspecified values are read as UTC; sub-millisecond ticks are dropped.</param>
    /// <param name="to">The exclusive window end, after <paramref name="from"/> and at most 3,700 days later.</param>
    /// <exception cref="ArgumentException">The start column is empty, or the window is empty or longer than 3,700 days.</exception>
    /// <exception cref="ArgumentOutOfRangeException">An instant falls outside the years 0002 to 9998.</exception>
    public CanopyGridRangeQuery(CanopyGridQuery query, string start, DateTime from, DateTime to) {
        Query = query ?? throw new ArgumentNullException(nameof(query));
        CanopyIdentifiers.Require(start, nameof(start));
        Start = start;
        From = CanopyGridRanges.Instant(from, nameof(from));
        To = CanopyGridRanges.Instant(to, nameof(to));
        CanopyGridRanges.Window(From, To, nameof(to));
    }

    /// <summary>Gets the complete accepted query whose search, predicates and filter group select the records.</summary>
    public CanopyGridQuery Query { get; }

    /// <summary>Gets the date column holding each record's start.</summary>
    public string Start { get; }

    /// <summary>Gets the inclusive UTC window start, at millisecond precision.</summary>
    public DateTime From { get; }

    /// <summary>Gets the exclusive UTC window end, at millisecond precision.</summary>
    public DateTime To { get; }

    /// <summary>Gets or sets the date column holding each record's end; null treats every record as a marker at its start.</summary>
    public string? End { get; set; }

    /// <summary>Gets or sets the text column holding each record's recurrence rule; null treats every record as a single event.</summary>
    public string? Recurrence { get; set; }

    /// <summary>Gets or sets the date column holding the end of a recurring record's last occurrence (null for an endless series).</summary>
    public string? SeriesEnd { get; set; }

    /// <summary>Gets or sets the text column holding each record's resource identity; <see cref="Resources"/> requires it.</summary>
    public string? Resource { get; set; }

    /// <summary>Gets the resource identities the range is restricted to: empty for no restriction, otherwise 1 to 1,000 unique,
    /// nonempty identities of at most 4,096 characters.</summary>
    public IList<string> Resources { get; } = new List<string>();

    /// <summary>Gets or sets the calendar view that asks, for logging and host decisions: <c>month</c>, <c>week</c>, <c>day</c>,
    /// <c>days</c>, <c>agenda</c>, <c>year</c> or <c>timeline</c>. Servers do not trust it.</summary>
    public string? CalendarView { get; set; }

    /// <summary>Gets or sets the most records the answer may hold, from 1 to 10,000. Default 5,000; servers may lower it.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 10,000.</exception>
    public int Limit {
        get => _limit;
        set => _limit = value < 1 || value > 10000 ? throw new ArgumentOutOfRangeException(nameof(value)) : value;
    }

    /// <summary>Writes the HTML-safe <c>gridRangeQuery</c> after validating its owning view, columns and accepted query.</summary>
    /// <param name="view">The owning grid definition.</param>
    /// <returns>The range request.</returns>
    /// <exception cref="InvalidOperationException">The view uses cursor navigation, the query has a window offset, a column is
    /// undeclared or of the wrong kind, or the resources or calendar view are invalid.</exception>
    public string ToJson(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        if (view.Navigation != CanopyGridNavigation.Offset) throw new InvalidOperationException("Range requests carry an offset query.");
        Query.Validate(view);
        if (Query.Offset != 0) throw new InvalidOperationException("A range request carries its query at offset zero.");
        CanopyGridRanges.Column(view, Start, CanopyColumnKind.DateTime, "start");
        if (End != null) CanopyGridRanges.Column(view, End, CanopyColumnKind.DateTime, "end");
        if (Recurrence != null) CanopyGridRanges.Column(view, Recurrence, CanopyColumnKind.Text, "recurrence");
        if (SeriesEnd != null) CanopyGridRanges.Column(view, SeriesEnd, CanopyColumnKind.DateTime, "series end");
        if (Resource != null) CanopyGridRanges.Column(view, Resource, CanopyColumnKind.Text, "resource");
        if (Resources.Count > 0 && Resource == null) throw new InvalidOperationException("A resource restriction needs the resource column.");
        CanopyGridRanges.Resources(Resources);
        if (CalendarView != null && Array.IndexOf(CanopyGridRanges.CalendarViews, CalendarView) < 0)
            throw new InvalidOperationException("The calendar view is month, week, day, days, agenda, year or timeline.");
        var writer = new CanopyJsonWriter();
        writer.BeginObject().Envelope("gridRangeQuery").Property("view", view.Id).Name("query");
        Query.WriteJson(writer, view);
        writer.Property("from", CanopyGridRanges.Format(From)).Property("to", CanopyGridRanges.Format(To)).Property("start", Start)
            .OptionalProperty("end", End).OptionalProperty("recurrence", Recurrence).OptionalProperty("seriesEnd", SeriesEnd).OptionalProperty("resource", Resource);
        if (Resources.Count > 0) writer.StringArray("resources", Resources);
        return writer.OptionalProperty("calendarView", CalendarView).Property("limit", Limit).EndObject().ToString();
    }
}
