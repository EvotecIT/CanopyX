using System;
using System.Collections.Generic;
using System.Linq;

namespace CanopyX;

public sealed partial class CanopyCell {
    /// <summary>
    /// Creates a status history cell for a <see cref="CanopyGridPresenter.StatusStrip()"/> column: the periods in order, with
    /// the latest period's state as the raw value, so the column sorts, filters, searches and exports by the current state.
    /// </summary>
    /// <param name="periods">The periods, oldest first; at most 4096.</param>
    /// <param name="state">The raw value instead of the latest state, for example a summary such as "3 of 24 failing".</param>
    /// <returns>The cell; empty (with no value) when there are no periods and no state.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="periods"/> is null.</exception>
    /// <exception cref="ArgumentException">A period is null, or there are more than 4096.</exception>
    public static CanopyCell StatusHistory(IEnumerable<CanopyCellPeriod> periods, string? state = null) {
        var list = History(periods);
        var cell = new CanopyCell(state ?? (list.Count > 0 ? list[list.Count - 1].State : null));
        cell._series = list;
        return cell;
    }

    /// <summary>
    /// Creates a numeric history cell for a sparkline column (<see cref="CanopyGridPresenter.SparklineBars"/> or
    /// <see cref="CanopyGridPresenter.SparklineLine"/>): the periods in order, with the latest numeric sample as the raw
    /// value, so a number column sorts and filters by the current value.
    /// </summary>
    /// <param name="periods">The periods, oldest first; at most 4096.</param>
    /// <param name="value">The raw value instead of the latest sample, for example an average.</param>
    /// <returns>The cell; empty (with no value) when no period has a sample and no value is given.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="periods"/> is null.</exception>
    /// <exception cref="ArgumentException">A period is null, or there are more than 4096.</exception>
    public static CanopyCell ValueHistory(IEnumerable<CanopyCellPeriod> periods, double? value = null) {
        var list = History(periods);
        double? latest = value;
        for (var index = list.Count - 1; latest == null && index >= 0; index--) latest = list[index].Value;
        var cell = latest.HasValue ? new CanopyCell(latest.Value) : new CanopyCell();
        cell._series = list;
        return cell;
    }

    /// <summary>Whether the cell holds history periods, without creating the list.</summary>
    internal bool HasSeries => _series != null && _series.Count > 0;

    internal static List<CanopyCellPeriod> History(IEnumerable<CanopyCellPeriod> periods) {
        if (periods == null) throw new ArgumentNullException(nameof(periods));
        var list = periods.Take(4097).ToList();
        if (list.Count > 4096) throw new ArgumentException("A cell history holds at most 4096 periods.", nameof(periods));
        if (list.Exists(period => period == null)) throw new ArgumentException("A cell history has no null periods.", nameof(periods));
        return list;
    }
}
