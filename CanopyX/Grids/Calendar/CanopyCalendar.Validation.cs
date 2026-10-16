using System;
using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyCalendar {
    private static readonly CanopyCalendarView[] DefaultViews = { CanopyCalendarView.Month, CanopyCalendarView.Week, CanopyCalendarView.Day, CanopyCalendarView.Agenda };
    private static readonly CanopyCalendarZoom[] AllZooms = { CanopyCalendarZoom.Hour, CanopyCalendarZoom.Day, CanopyCalendarZoom.Week, CanopyCalendarZoom.Month, CanopyCalendarZoom.Quarter };

    /// <summary>The views the calendar offers: <see cref="Views"/>, or the defaults (with the timeline when there are resources).</summary>
    private IList<CanopyCalendarView> EffectiveViews {
        get {
            if (Views.Count > 0) return Views;
            var views = new List<CanopyCalendarView>(DefaultViews);
            if (Resources != null) views.Add(CanopyCalendarView.Timeline);
            return views;
        }
    }

    internal void Validate(CanopyDataGridView view) {
        var columns = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in view.Columns) if (column != null) columns[column.Id] = column;
        if (_start.Length == 0) throw new InvalidOperationException("A calendar needs a start column.");
        Require(columns, _start, "start", CanopyColumnKind.DateTime);
        Require(columns, _end, "end", CanopyColumnKind.DateTime);
        Require(columns, _title, "title", null);
        Require(columns, _subtitle, "subtitle", null);
        Require(columns, _allDay, "allDay", CanopyColumnKind.Text);
        Require(columns, _resource, "resource", CanopyColumnKind.Text);
        Require(columns, _status, "status", null);
        Require(columns, _recurrence, "recurrence", CanopyColumnKind.Text);
        Require(columns, _exceptions, "exceptions", CanopyColumnKind.Text);
        Require(columns, _series, "series", CanopyColumnKind.Text);
        Require(columns, _recurrenceId, "recurrenceId", CanopyColumnKind.DateTime);
        Require(columns, _display, "display", CanopyColumnKind.Text);
        Require(columns, _seriesEnd, "seriesEnd", CanopyColumnKind.DateTime);
        if ((_series == null) != (_recurrenceId == null)) throw new InvalidOperationException("A calendar's series and recurrenceId columns are set together.");

        Distinct(Views, "Calendar views", value => value >= CanopyCalendarView.Month && value <= CanopyCalendarView.Timeline);
        var offered = EffectiveViews;
        if (offered.Contains(CanopyCalendarView.Timeline) && Resources == null) throw new InvalidOperationException("The timeline view needs calendar resources.");
        if (View.HasValue && !offered.Contains(View.Value)) throw new InvalidOperationException("The calendar's first view must be one of its views.");
        if (PhoneView.HasValue && !offered.Contains(PhoneView.Value)) throw new InvalidOperationException("The calendar's phone view must be one of its views.");
        if (FirstDay.HasValue && (FirstDay.Value < DayOfWeek.Sunday || FirstDay.Value > DayOfWeek.Saturday)) throw new ArgumentOutOfRangeException(nameof(FirstDay), FirstDay, "Unknown weekday.");
        if (HiddenDays.Count > 0) CanopyCalendarValues.Days(HiddenDays, 1, 6, "Hidden days");

        var min = _minTime ?? TimeSpan.Zero;
        var max = _maxTime ?? TimeSpan.FromDays(1);
        if ((long)min.TotalMinutes % _slotMinutes != 0 || (long)max.TotalMinutes % _slotMinutes != 0) throw new InvalidOperationException("The calendar's visible hours start and end on time slot boundaries.");
        if (max <= min) throw new InvalidOperationException("The calendar's visible hours end after they start.");
        WorkingHours?.Validate();
        if (EventStyle != CanopyCalendarEventStyle.Quiet && EventStyle != CanopyCalendarEventStyle.Strong) throw new ArgumentOutOfRangeException(nameof(EventStyle), EventStyle, "Unknown event style.");

        if (Editing != null) {
            Require(columns, Editing.AllowedResources, "editable.allowedResources", CanopyColumnKind.Text);
            if (Editing.Commit != CanopyCalendarCommit.Auto && Editing.Commit != CanopyCalendarCommit.Manual) throw new ArgumentOutOfRangeException(nameof(Editing), Editing.Commit, "Unknown commit mode.");
        }
        Resources?.Validate();

        Distinct(Zooms, "Timeline zooms", value => value >= CanopyCalendarZoom.Hour && value <= CanopyCalendarZoom.Quarter);
        if (Zoom < CanopyCalendarZoom.Hour || Zoom > CanopyCalendarZoom.Quarter) throw new ArgumentOutOfRangeException(nameof(Zoom), Zoom, "Unknown timeline zoom.");
        // The default zoom (Day) left out of Zooms means the first of Zooms, as the browser reads it.
        if (Zooms.Count > 0 && !Zooms.Contains(Zoom) && Zoom != CanopyCalendarZoom.Day) throw new InvalidOperationException("The timeline's zoom must be one of its zooms.");
        Capacity?.Validate();

        if (Ranges.Count > 1000) throw new InvalidOperationException("A calendar has at most 1,000 ranges.");
        foreach (var range in Ranges) (range ?? throw new InvalidOperationException("A calendar cannot have a null range.")).Validate();
        if (Availability.Count > 10000) throw new InvalidOperationException("A calendar has at most 10,000 business hours.");
        foreach (var hours in Availability) (hours ?? throw new InvalidOperationException("A calendar cannot have null business hours.")).Validate();
    }

    private static void Require(Dictionary<string, CanopyColumn> columns, string? id, string role, CanopyColumnKind? kind) {
        if (id == null) return;
        if (!columns.TryGetValue(id, out var column)) throw new InvalidOperationException("The calendar's " + role + " column '" + id + "' is not declared.");
        if (kind.HasValue && column.Kind != kind.Value)
            throw new InvalidOperationException("The calendar's " + role + " column '" + id + "' must be a " + (kind.Value == CanopyColumnKind.DateTime ? "date-and-time" : "text") + " column.");
    }

    private static void Distinct<T>(IList<T> values, string what, Func<T, bool> known) {
        var seen = new HashSet<T>();
        foreach (var value in values) {
            if (!known(value)) throw new ArgumentOutOfRangeException(nameof(values), value, what + " must be known values.");
            if (!seen.Add(value)) throw new InvalidOperationException(what + " must be distinct.");
        }
    }
}
