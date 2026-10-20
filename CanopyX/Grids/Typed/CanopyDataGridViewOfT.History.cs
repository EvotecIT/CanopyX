using System;
using System.Collections.Generic;
using System.Linq.Expressions;

namespace CanopyX;

public sealed partial class CanopyDataGridView<T> {
    /// <summary>
    /// Adds a status strip column for a member holding a history of periods (one segment per period, toned by state), and
    /// returns it. Its raw value is the latest period's state (<see cref="CanopyCell.StatusHistory"/>), or the text
    /// <paramref name="state"/> returns, so it sorts, filters, searches and exports like a text column.
    /// </summary>
    /// <param name="member">The member, as <c>x =&gt; x.Hours</c>; a null history leaves the cell empty.</param>
    /// <param name="title">The column's title; by default the member path as words.</param>
    /// <param name="configure">Sets the column's other options.</param>
    /// <param name="state">Returns the raw value for a history, for example "3 of 24 failing"; by default the latest state.</param>
    /// <returns>The column added to <see cref="View"/>.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain, or the column id is taken.</exception>
    public CanopyColumn StatusStrip(Expression<Func<T, IEnumerable<CanopyCellPeriod>?>> member, string? title = null, Action<CanopyColumn>? configure = null,
        Func<IReadOnlyList<CanopyCellPeriod>, string?>? state = null) =>
        Column(member, title, column => { column.Kind = CanopyColumnKind.Text; column.Presenter = CanopyGridPresenter.StatusStrip(); configure?.Invoke(column); },
            periods => { if (periods == null) return null; var list = new List<CanopyCellPeriod>(periods); return CanopyCell.StatusHistory(list, state?.Invoke(list)); });

    /// <summary>
    /// Adds a sparkline column for a member holding a history of numeric samples, and returns it. Its raw value is the latest
    /// sample (<see cref="CanopyCell.ValueHistory"/>), or the number <paramref name="value"/> returns, so it sorts and filters
    /// like a number column.
    /// </summary>
    /// <param name="member">The member, as <c>x =&gt; x.Latency</c>; a null history leaves the cell empty.</param>
    /// <param name="title">The column's title; by default the member path as words.</param>
    /// <param name="presenter">The sparkline: <see cref="CanopyGridPresenter.SparklineBars"/> (the default) or <see cref="CanopyGridPresenter.SparklineLine"/>, with thresholds and scale.</param>
    /// <param name="configure">Sets the column's other options.</param>
    /// <param name="value">Returns the raw value for a history, for example an average; by default the latest sample.</param>
    /// <returns>The column added to <see cref="View"/>.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain, the column id is taken, or the presenter is not a sparkline.</exception>
    public CanopyColumn Sparkline(Expression<Func<T, IEnumerable<CanopyCellPeriod>?>> member, string? title = null, CanopyGridPresenter? presenter = null,
        Action<CanopyColumn>? configure = null, Func<IReadOnlyList<CanopyCellPeriod>, double?>? value = null) {
        var chosen = presenter ?? CanopyGridPresenter.SparklineBars();
        if (chosen.Kind != CanopyGridPresenterKind.SparklineBars && chosen.Kind != CanopyGridPresenterKind.SparklineLine)
            throw new ArgumentException("A sparkline column takes a SparklineBars or SparklineLine presenter.", nameof(presenter));
        return Column(member, title, column => { column.Kind = CanopyColumnKind.Number; column.Presenter = chosen; configure?.Invoke(column); },
            periods => { if (periods == null) return null; var list = new List<CanopyCellPeriod>(periods); return CanopyCell.ValueHistory(list, value?.Invoke(list)); });
    }
}
