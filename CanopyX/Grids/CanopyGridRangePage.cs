using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A revisioned answer to a <see cref="CanopyGridRangeQuery"/>: the first records that overlap a UTC window, by start.</summary>
/// <remarks>
/// <see cref="Matched"/> counts every overlapping record after the query's criteria and the resource restriction;
/// <see cref="Rows"/> holds the first of them, ordered by start ascending and then by record identity, and
/// <c>truncated</c> is written as <c>items.length &lt; matched</c>.
/// </remarks>
public sealed class CanopyGridRangePage {
    /// <summary>Creates a range answer.</summary>
    /// <param name="view">The target grid identity.</param>
    /// <param name="revision">The dataset snapshot identity.</param>
    /// <param name="start">The date column the rows are ordered by (the request's start column); it is not written.</param>
    /// <param name="from">The inclusive UTC window start of the request.</param>
    /// <param name="to">The exclusive UTC window end of the request.</param>
    /// <param name="matched">The number of overlapping records before the limit.</param>
    /// <exception cref="ArgumentException">An identity is empty, or the window is empty or longer than 3,700 days.</exception>
    /// <exception cref="ArgumentOutOfRangeException">The count is negative, or an instant falls outside the years 0002 to 9998.</exception>
    public CanopyGridRangePage(string view, string revision, string start, DateTime from, DateTime to, int matched) {
        CanopyIdentifiers.Require(view, nameof(view));
        CanopyIdentifiers.Require(revision, nameof(revision));
        CanopyIdentifiers.Require(start, nameof(start));
        if (matched < 0) throw new ArgumentOutOfRangeException(nameof(matched));
        View = view;
        Revision = revision;
        Start = start;
        From = CanopyGridRanges.Instant(from, nameof(from));
        To = CanopyGridRanges.Instant(to, nameof(to));
        CanopyGridRanges.Window(From, To, nameof(to));
        Matched = matched;
    }

    /// <summary>Gets the target grid identity.</summary>
    public string View { get; }

    /// <summary>Gets the dataset snapshot identity.</summary>
    public string Revision { get; }

    /// <summary>Gets the date column the rows are ordered by.</summary>
    public string Start { get; }

    /// <summary>Gets the inclusive UTC window start, at millisecond precision.</summary>
    public DateTime From { get; }

    /// <summary>Gets the exclusive UTC window end, at millisecond precision.</summary>
    public DateTime To { get; }

    /// <summary>Gets the number of overlapping records before the limit.</summary>
    public int Matched { get; }

    /// <summary>Gets the returned records, at most 10,000, ordered by start ascending and then by record identity.</summary>
    public IList<CanopyGridRow> Rows { get; } = new List<CanopyGridRow>();

    /// <summary>Writes the HTML-safe <c>gridRangePage</c>, checking rows against the view, the counts and the start order.</summary>
    /// <param name="view">The owning grid definition.</param>
    /// <returns>The range answer.</returns>
    /// <exception cref="InvalidOperationException">The view is another grid or not an offset grid, the start column is not a
    /// declared date column, rows duplicate identities or break the view's cells, the counts contradict each other, or a row
    /// has no start, starts at or after the window end, or starts before the row it follows.</exception>
    public string ToJson(CanopyDataGridView view) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        if (view.Id != View || view.Navigation != CanopyGridNavigation.Offset) throw new InvalidOperationException("A range answer must target its owning offset grid.");
        CanopyGridRanges.Column(view, Start, CanopyColumnKind.DateTime, "start");
        if (Rows.Count > 10000) throw new InvalidOperationException("A range answer cannot contain more than 10,000 rows.");
        if (Rows.Count > Matched) throw new InvalidOperationException("A range answer cannot hold more rows than overlap the window.");
        if (Rows.Count == 0 && Matched > 0) throw new InvalidOperationException("A range answer cannot be empty when records overlap the window.");
        CanopyGridRows.Validate(Rows, view.ValidateColumns(), view.Columns, view.Reporting?.Detail);
        var end = CanopyGridRanges.Milliseconds(To);
        long previous = long.MinValue;
        foreach (var row in Rows) {
            if (!row.Cells.TryGetValue(Start, out var cell) || !(CanopyGridValues.Normalize(cell?.Value) is DateTime start))
                throw new InvalidOperationException("Every range row needs its start value.");
            var at = CanopyGridRanges.Milliseconds(start);
            if (at >= end) throw new InvalidOperationException("A range row cannot start at or after the window end.");
            if (at < previous) throw new InvalidOperationException("Range rows must be ordered by their start.");
            previous = at;
        }
        var writer = new CanopyJsonWriter(4096);
        writer.BeginObject().Envelope("gridRangePage").Property("view", View).Property("revision", Revision)
            .Property("from", CanopyGridRanges.Format(From)).Property("to", CanopyGridRanges.Format(To))
            .Property("matched", Matched).Property("truncated", Rows.Count < Matched).Name("items").BeginArray();
        foreach (var row in Rows) row.WriteJson(writer);
        return writer.EndArray().EndObject().ToString();
    }
}
