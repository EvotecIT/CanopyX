using System;
using System.Linq.Expressions;

namespace CanopyX;

/// <summary>
/// Typed settings of a <see cref="CanopyCalendar"/> on a <see cref="CanopyDataGridView{T}"/>: each role is a member expression, so
/// a renamed member fails the build. A member the grid has no column for yet becomes a column (technical ones, the recurrence
/// rule, its exceptions and the series end, hidden); one it already has is reused.
/// </summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>Get it from <see cref="CanopyDataGridView{T}.Calendar"/>. Every other setting (views, hours, resources, editing) is set
/// on <see cref="Definition"/>.</remarks>
public sealed class CanopyCalendar<T> {
    private readonly CanopyDataGridView<T> _grid;

    internal CanopyCalendar(CanopyDataGridView<T> grid, CanopyCalendar definition) {
        _grid = grid;
        Definition = definition;
    }

    /// <summary>Gets the calendar definition the typed settings write to, <see cref="CanopyDataGridView.Calendar"/>.</summary>
    public CanopyCalendar Definition { get; }

    /// <summary>Sets the member that holds each event's start.</summary>
    /// <param name="member">The member, such as <c>x =&gt; x.Starts</c>.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Start(Expression<Func<T, DateTime>> member) { Definition.Start = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's start.</summary>
    /// <param name="member">The member; a record without a start is not shown.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Start(Expression<Func<T, DateTime?>> member) { Definition.Start = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's start.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Start(Expression<Func<T, DateTimeOffset>> member) { Definition.Start = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's start.</summary>
    /// <param name="member">The member; a record without a start is not shown.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Start(Expression<Func<T, DateTimeOffset?>> member) { Definition.Start = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's end.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> End(Expression<Func<T, DateTime>> member) { Definition.End = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's end; an empty end makes a zero-length marker.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> End(Expression<Func<T, DateTime?>> member) { Definition.End = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's end.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> End(Expression<Func<T, DateTimeOffset>> member) { Definition.End = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's end; an empty end makes a zero-length marker.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> End(Expression<Func<T, DateTimeOffset?>> member) { Definition.End = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's title.</summary>
    /// <typeparam name="TValue">The member's type.</typeparam>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Title<TValue>(Expression<Func<T, TValue>> member) { Definition.Title = Bind(member, false); return this; }

    /// <summary>Sets the member shown as a second line under each event's title.</summary>
    /// <typeparam name="TValue">The member's type.</typeparam>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Subtitle<TValue>(Expression<Func<T, TValue>> member) { Definition.Subtitle = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's resource id, a node id of the calendar's resources.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Resource(Expression<Func<T, string?>> member) { Definition.Resource = Bind(member, false); return this; }

    /// <summary>Sets the member that marks all-day events.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> AllDay(Expression<Func<T, bool>> member) { Definition.AllDay = Bind(member, false); return this; }

    /// <summary>Sets the member that marks all-day events; an empty value is a timed event.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> AllDay(Expression<Func<T, bool?>> member) { Definition.AllDay = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's status, shown with its column's presenter; its tone colours the event.</summary>
    /// <typeparam name="TValue">The member's type.</typeparam>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Status<TValue>(Expression<Func<T, TValue>> member) { Definition.Status = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's description, shown in the details popover and the hover card.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Description(Expression<Func<T, string?>> member) { Definition.Description = Bind(member, false); return this; }

    /// <summary>Sets the member that holds each event's tone name, which wins over the status tone; a new column for it is hidden.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Tone(Expression<Func<T, string?>> member) { Definition.Tone = Bind(member, true); return this; }

    /// <summary>Sets the member that holds each event's source id, one of the calendar's sources; a new column for it is hidden.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Source(Expression<Func<T, string?>> member) { Definition.Source = Bind(member, true); return this; }

    /// <summary>Sets the defaults of a preset on <see cref="Definition"/> (see <see cref="CanopyCalendar.ApplyPreset"/>).</summary>
    /// <param name="preset">The preset.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="preset"/> is not a known preset.</exception>
    public CanopyCalendar<T> Preset(CanopyCalendarPreset preset) { Definition.ApplyPreset(preset); return this; }

    /// <summary>Sets the member that holds each event's recurrence rule text; a new column for it is hidden.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Recurrence(Expression<Func<T, string?>> member) { Definition.Recurrence = Bind(member, true); return this; }

    /// <summary>Sets the member that holds each event's recurrence rule, written as its rule text; a new column for it is hidden.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Recurrence(Expression<Func<T, CanopyRecurrence?>> member) { Definition.Recurrence = Bind(member, true); return this; }

    /// <summary>Sets the member that holds each series' excluded occurrences (ISO date-times or <c>yyyy-MM-dd</c> dates separated by commas, semicolons or white space); a new column for it is hidden.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> Exceptions(Expression<Func<T, string?>> member) { Definition.Exceptions = Bind(member, true); return this; }

    /// <summary>Sets the member that holds the end of each series' last occurrence; a new column for it is hidden.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> SeriesEnd(Expression<Func<T, DateTime>> member) { Definition.SeriesEnd = Bind(member, true); return this; }

    /// <summary>Sets the member that holds the end of each series' last occurrence, empty for endless series; a new column for it is hidden.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> SeriesEnd(Expression<Func<T, DateTime?>> member) { Definition.SeriesEnd = Bind(member, true); return this; }

    /// <summary>Sets the member that holds the end of each series' last occurrence; a new column for it is hidden.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> SeriesEnd(Expression<Func<T, DateTimeOffset>> member) { Definition.SeriesEnd = Bind(member, true); return this; }

    /// <summary>Sets the member that holds the end of each series' last occurrence, empty for endless series; a new column for it is hidden.</summary>
    /// <param name="member">The member.</param>
    /// <returns>This builder.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="member"/> is null.</exception>
    /// <exception cref="ArgumentException">The expression is not a member chain.</exception>
    public CanopyCalendar<T> SeriesEnd(Expression<Func<T, DateTimeOffset?>> member) { Definition.SeriesEnd = Bind(member, true); return this; }

    /// <summary>The id of the member's column, adding the column when the grid has none with that id.</summary>
    private string Bind<TValue>(Expression<Func<T, TValue>> member, bool hidden) {
        var id = _grid.ColumnId(member);
        foreach (var column in _grid.View.Columns) if (column != null && column.Id == id) return id;
        _grid.Column(member, configure: hidden ? new Action<CanopyColumn>(column => column.Hidden = true) : null);
        return id;
    }
}
