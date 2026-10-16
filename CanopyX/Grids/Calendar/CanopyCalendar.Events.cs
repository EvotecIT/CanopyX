using System;
using System.Collections.Generic;

namespace CanopyX;

// Basic calendars: events without a grid schema of their own.
public sealed partial class CanopyCalendar {
    /// <summary>The fixed column ids of a calendar built from events.</summary>
    private const string ColumnTitle = "title", ColumnStart = "start", ColumnEnd = "end", ColumnAllDay = "allDay", ColumnDescription = "description", ColumnTone = "tone",
        ColumnResource = "resource", ColumnRecurrence = "recurrence", ColumnExceptions = "exceptions", ColumnSource = "source";

    /// <summary>The columns of a calendar built from events that editing changes, and so are editable while the calendar edits.</summary>
    private static readonly string[] EditedColumns = { ColumnTitle, ColumnStart, ColumnEnd, ColumnResource, ColumnAllDay, ColumnRecurrence, ColumnExceptions };

    /// <summary>
    /// Creates a basic calendar of events, with its own grid (<see cref="Grid"/>, id <c>calendar</c>), set up by a preset.
    /// </summary>
    /// <param name="events">The events, in order.</param>
    /// <param name="preset">The preset whose defaults apply; <see cref="CanopyCalendarPreset.Basic"/> by default.</param>
    /// <exception cref="ArgumentNullException"><paramref name="events"/> or one of them is null.</exception>
    /// <exception cref="ArgumentException">Two events have the same id.</exception>
    public CanopyCalendar(IEnumerable<CanopyCalendarEvent> events, CanopyCalendarPreset preset = CanopyCalendarPreset.Basic)
        : this("calendar", "Calendar", events, preset) {
    }

    /// <summary>
    /// Creates a basic calendar of events, with its own grid (<see cref="Grid"/>), set up by a preset.
    /// </summary>
    /// <remarks>
    /// The grid has the columns <c>title</c> (the row header), <c>start</c> and <c>end</c> (date and time), and the text columns
    /// <c>allDay</c>, <c>description</c>, <c>tone</c>, <c>resource</c>, <c>recurrence</c>, <c>exceptions</c> and <c>source</c> when
    /// an event uses them; all of these but the description are hidden. A row's id is the event's <see cref="CanopyCalendarEvent.Id"/>,
    /// else <c>e1</c>, <c>e2</c>, ... in input order. The title, start, end, resource, all-day, recurrence and exceptions columns are
    /// editable exactly while the calendar edits (<see cref="Editing"/>), creates (<see cref="Create"/>) or accepts drops
    /// (<see cref="Drop"/>).
    /// </remarks>
    /// <param name="id">The grid's id, unique within the page.</param>
    /// <param name="label">The grid's accessible name.</param>
    /// <param name="events">The events, in order.</param>
    /// <param name="preset">The preset whose defaults apply; <see cref="CanopyCalendarPreset.Basic"/> by default.</param>
    /// <exception cref="ArgumentNullException"><paramref name="events"/> or one of them is null.</exception>
    /// <exception cref="ArgumentException">The id or label is empty, or two events have the same id.</exception>
    public CanopyCalendar(string id, string label, IEnumerable<CanopyCalendarEvent> events, CanopyCalendarPreset preset = CanopyCalendarPreset.Basic) {
        if (events == null) throw new ArgumentNullException(nameof(events));
        var grid = new CanopyDataGridView(id, label);
        var list = new List<CanopyCalendarEvent>();
        foreach (var item in events) list.Add(item ?? throw new ArgumentNullException(nameof(events), "A calendar cannot have a null event."));
        _start = ColumnStart;
        grid.Columns.Add(new CanopyColumn(ColumnTitle, "Title") { RowHeader = true });
        grid.Columns.Add(new CanopyColumn(ColumnStart, "Start") { Kind = CanopyColumnKind.DateTime });
        grid.Columns.Add(new CanopyColumn(ColumnEnd, "End") { Kind = CanopyColumnKind.DateTime });
        _end = ColumnEnd;
        if (list.Exists(item => item.AllDay)) _allDay = Optional(grid, ColumnAllDay, "All day", true);
        if (list.Exists(item => item.Description != null)) _description = Optional(grid, ColumnDescription, "Description", false);
        if (list.Exists(item => item.Tone.Name != null)) _tone = Optional(grid, ColumnTone, "Tone", true);
        if (list.Exists(item => item.Resource != null)) _resource = Optional(grid, ColumnResource, "Resource", true);
        if (list.Exists(item => item.Recurrence != null)) _recurrence = Optional(grid, ColumnRecurrence, "Repeats", true);
        if (list.Exists(item => item.Exceptions != null)) _exceptions = Optional(grid, ColumnExceptions, "Exceptions", true);
        if (list.Exists(item => item.Source != null)) _source = Optional(grid, ColumnSource, "Source", true);

        var ids = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < list.Count; index++) {
            var item = list[index];
            var row = new CanopyGridRow(item.Id ?? "e" + (index + 1).ToString(System.Globalization.CultureInfo.InvariantCulture));
            if (!ids.Add(row.Id)) throw new ArgumentException("Two calendar events have the id '" + row.Id + "'.", nameof(events));
            row.Cells[ColumnTitle] = item.Title;
            row.Cells[ColumnStart] = item.StartCell;
            var end = item.EndCell;
            if (end.HasValue) row.Cells[ColumnEnd] = end.Value;
            if (item.AllDay) row.Cells[ColumnAllDay] = true;
            if (item.Description != null) row.Cells[ColumnDescription] = item.Description;
            if (item.Tone.Name != null) row.Cells[ColumnTone] = item.Tone.Name;
            if (item.Resource != null) row.Cells[ColumnResource] = item.Resource;
            if (item.Recurrence != null) row.Cells[ColumnRecurrence] = item.Recurrence.ToString();
            if (item.Exceptions != null) row.Cells[ColumnExceptions] = item.Exceptions;
            if (item.Source != null) row.Cells[ColumnSource] = item.Source;
            grid.Rows.Add(row);
        }
        grid.Calendar = this;
        Grid = grid;
        ApplyPreset(preset);
    }

    /// <summary>
    /// Gets the grid of a calendar built from events, whose <see cref="CanopyDataGridView.Calendar"/> is this calendar; null for a
    /// calendar of an existing grid's records. Write it (or the calendar, with the HTML extensions) to show the calendar.
    /// </summary>
    public CanopyDataGridView? Grid { get; }

    /// <summary>Creates a basic calendar of items, one event per item.</summary>
    /// <typeparam name="T">The item type.</typeparam>
    /// <param name="items">The items, in order.</param>
    /// <param name="title">Each event's title.</param>
    /// <param name="start">Each event's start; a local time is converted to UTC, an unspecified one is taken as UTC.</param>
    /// <param name="end">Each event's end, or null for none.</param>
    /// <param name="id">Each event's row id, or null to number them <c>e1</c>, <c>e2</c>, ...; a selector returning null numbers that event.</param>
    /// <param name="allDay">Whether each event lasts whole days, or null for timed events.</param>
    /// <param name="preset">The preset whose defaults apply.</param>
    /// <param name="configure">Sets anything else of each event (description, tone, resource, recurrence, source), or null.</param>
    /// <returns>The calendar, with its <see cref="Grid"/>.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="items"/>, <paramref name="title"/> or <paramref name="start"/> is null, or a title is null.</exception>
    /// <exception cref="ArgumentException">Two events have the same id.</exception>
    public static CanopyCalendar From<T>(IEnumerable<T> items, Func<T, string> title, Func<T, DateTime> start, Func<T, DateTime?>? end = null,
        Func<T, string?>? id = null, Func<T, bool>? allDay = null, CanopyCalendarPreset preset = CanopyCalendarPreset.Basic, Action<T, CanopyCalendarEvent>? configure = null) {
        if (start == null) throw new ArgumentNullException(nameof(start));
        return FromItems(items, title, item => new CanopyCalendarEvent(title(item), start(item)) { End = end?.Invoke(item) }, id, allDay, preset, configure);
    }

    /// <summary>Creates a basic calendar of items, one event per item.</summary>
    /// <typeparam name="T">The item type.</typeparam>
    /// <param name="items">The items, in order.</param>
    /// <param name="title">Each event's title.</param>
    /// <param name="start">Each event's start.</param>
    /// <param name="end">Each event's end, or null for none.</param>
    /// <param name="id">Each event's row id, or null to number them <c>e1</c>, <c>e2</c>, ...; a selector returning null numbers that event.</param>
    /// <param name="allDay">Whether each event lasts whole days, or null for timed events.</param>
    /// <param name="preset">The preset whose defaults apply.</param>
    /// <param name="configure">Sets anything else of each event (description, tone, resource, recurrence, source), or null.</param>
    /// <returns>The calendar, with its <see cref="Grid"/>.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="items"/>, <paramref name="title"/> or <paramref name="start"/> is null, or a title is null.</exception>
    /// <exception cref="ArgumentException">Two events have the same id.</exception>
    public static CanopyCalendar From<T>(IEnumerable<T> items, Func<T, string> title, Func<T, DateTimeOffset> start, Func<T, DateTimeOffset?>? end = null,
        Func<T, string?>? id = null, Func<T, bool>? allDay = null, CanopyCalendarPreset preset = CanopyCalendarPreset.Basic, Action<T, CanopyCalendarEvent>? configure = null) {
        if (start == null) throw new ArgumentNullException(nameof(start));
        return FromItems(items, title, item => new CanopyCalendarEvent(title(item), start(item), end?.Invoke(item)), id, allDay, preset, configure);
    }

    private static CanopyCalendar FromItems<T>(IEnumerable<T> items, Func<T, string> title, Func<T, CanopyCalendarEvent> create, Func<T, string?>? id,
        Func<T, bool>? allDay, CanopyCalendarPreset preset, Action<T, CanopyCalendarEvent>? configure) {
        if (items == null) throw new ArgumentNullException(nameof(items));
        if (title == null) throw new ArgumentNullException(nameof(title));
        var events = new List<CanopyCalendarEvent>();
        foreach (var item in items) {
            var created = create(item);
            if (id != null) created.Id = id(item);
            if (allDay != null) created.AllDay = allDay(item);
            configure?.Invoke(item, created);
            events.Add(created);
        }
        return new CanopyCalendar(events, preset);
    }

    private static string Optional(CanopyDataGridView grid, string id, string label, bool hidden) {
        grid.Columns.Add(new CanopyColumn(id, label) { Hidden = hidden });
        return id;
    }

    /// <summary>Makes the edited columns of a calendar built from events editable exactly while the calendar edits, creates or accepts drops.</summary>
    private void SyncEventColumns(CanopyDataGridView view) {
        if (!ReferenceEquals(view, Grid)) return;
        var editable = Editing != null || Create != null || Drop;
        foreach (var column in view.Columns) {
            if (column != null && Array.IndexOf(EditedColumns, column.Id) >= 0 && column.Editor == null && column.Validation == null) column.Editable = editable;
        }
    }
}
