using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The grid whose records a collection's rows are (<see cref="CanopyRecordList.Target"/>): a row opens its record there (row ids
/// are that grid's record ids), and "Open all in grid" filters that grid to the collection's records.
/// </summary>
/// <remarks>
/// "Open all in grid" applies <see cref="Filters"/> when there are any, otherwise <see cref="Column"/> in <see cref="Values"/> (or in
/// the rows' ids when <see cref="Values"/> is empty). Hosts can take the action over with the browser's <c>canopyx:openAll</c> event
/// or the <c>onOpenAll</c> option, for example to filter a linked view.
/// An implicit condition becomes available after the collection is complete and contains 1 to 1,000 row ids, including
/// inline tree descendants. Use nonempty <see cref="Filters"/> or <see cref="Values"/> for an authoritative condition that
/// can be applied before every collection page is loaded. Larger collections can use such a condition or a host action
/// without <see cref="Column"/>; the browser does not truncate their ids to fit a membership condition.
/// </remarks>
public sealed class CanopyRecordTarget {
    /// <summary>Creates a target.</summary>
    /// <param name="view">The id of the grid on the page whose records the rows are.</param>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public CanopyRecordTarget(string view) {
        CanopyIdentifiers.Require(view, nameof(view));
        View = view;
    }

    /// <summary>Gets the id of the target grid.</summary>
    public string View { get; }

    /// <summary>Gets or sets the target grid's column that "Open all in grid" filters with an <c>in</c> condition.</summary>
    public string? Column { get; set; }

    /// <summary>Gets the values of the <see cref="Column"/> condition. Empty uses the ids of the collection's rows.</summary>
    public IList<CanopyCell> Values { get; } = new List<CanopyCell>();

    /// <summary>Gets explicit filters for the target grid, used instead of <see cref="Column"/> and <see cref="Values"/>.</summary>
    public IList<CanopyGridFilter> Filters { get; } = new List<CanopyGridFilter>();

    internal void WriteJson(CanopyJsonWriter writer) {
        if (Column != null) CanopyIdentifiers.Require(Column, nameof(Column));
        if (Values.Count > 1000) throw new InvalidOperationException("A target condition takes at most 1,000 values.");
        writer.BeginObject().Property("view", View).OptionalProperty("column", Column);
        if (Values.Count > 0) {
            writer.Name("values").BeginArray();
            foreach (var value in Values) {
                if (value?.Value == null) throw new InvalidOperationException("A target value cannot be empty.");
                value.WriteValue(writer);
            }
            writer.EndArray();
        }
        if (Filters.Count > 0) {
            writer.Name("filters").BeginArray();
            foreach (var filter in Filters) (filter ?? throw new InvalidOperationException("A target filter cannot be null.")).WriteJson(writer);
            writer.EndArray();
        }
        writer.EndObject();
    }
}
