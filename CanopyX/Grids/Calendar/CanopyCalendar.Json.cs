using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyCalendar {
    /// <summary>Writes the grid's <c>calendar</c> object: the start and every setting that differs from its default.</summary>
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("start", _start)
            .OptionalProperty("end", _end).OptionalProperty("title", _title).OptionalProperty("subtitle", _subtitle)
            .OptionalProperty("allDay", _allDay).OptionalProperty("resource", _resource).OptionalProperty("resourceIds", ResourceIds).OptionalProperty("status", _status)
            .OptionalProperty("recurrence", _recurrence).OptionalProperty("exceptions", _exceptions).OptionalProperty("series", _series)
            .OptionalProperty("recurrenceId", _recurrenceId).OptionalProperty("display", _display).OptionalProperty("seriesEnd", _seriesEnd)
            .OptionalProperty("description", _description).OptionalProperty("tone", _tone).OptionalProperty("source", _source);
        var offered = EffectiveViews;
        if (View.HasValue && View.Value != offered[0]) writer.Property("view", CanopyCalendarValues.Name(View.Value));
        if (Views.Count > 0 && !SameViews(Views)) {
            writer.Name("views").BeginArray();
            foreach (var view in Views) writer.String(CanopyCalendarValues.Name(view));
            writer.EndArray();
        }
        if (_date.HasValue) writer.Property("date", CanopyCalendarValues.Date(_date.Value));
        if (_days != 3) writer.Property("days", _days);
        if (FirstDay.HasValue) writer.Property("firstDay", (int)FirstDay.Value);
        if (HiddenDays.Count > 0) CanopyCalendarValues.WriteDays(writer, "hiddenDays", HiddenDays);
        if (_slotMinutes != 30) writer.Property("slotMinutes", _slotMinutes);
        if (_minTime.HasValue && _minTime.Value != TimeSpan.Zero) writer.Property("minTime", CanopyCalendarValues.Format(_minTime.Value));
        if (_maxTime.HasValue && _maxTime.Value != TimeSpan.FromDays(1)) writer.Property("maxTime", CanopyCalendarValues.Format(_maxTime.Value));
        if (_scrollTime.HasValue && _scrollTime.Value != TimeSpan.FromHours(8)) writer.Property("scrollTime", CanopyCalendarValues.Format(_scrollTime.Value));
        if (WorkingHours != null) { writer.Name("workingHours"); WorkingHours.WriteJson(writer); }
        if (!NowIndicator) writer.Property("nowIndicator", false);
        writer.OptionalProperty("eventLimit", _eventLimit);
        if (EventStyle == CanopyCalendarEventStyle.Strong) writer.Property("eventStyle", "strong");
        writer.OptionalProperty("timeZone", _timeZone);
        if (Editing != null) { writer.Name("editable"); Editing.WriteJson(writer); }
        if (Resources != null) { writer.Name("resources"); Resources.WriteJson(writer); }
        if (Zoom != CanopyCalendarZoom.Day) writer.Property("zoom", CanopyCalendarValues.Name(Zoom));
        if (Zooms.Count > 0 && !SameZooms(Zooms)) {
            writer.Name("zooms").BeginArray();
            foreach (var zoom in Zooms) writer.String(CanopyCalendarValues.Name(zoom));
            writer.EndArray();
        }
        if (Capacity != null) { writer.Name("capacity"); Capacity.WriteJson(writer); }
        if (Ranges.Count > 0) {
            writer.Name("ranges").BeginArray();
            foreach (var range in Ranges) range.WriteJson(writer);
            writer.EndArray();
        }
        if (Availability.Count > 0) {
            writer.Name("availability").BeginArray();
            foreach (var hours in Availability) hours.WriteJson(writer);
            writer.EndArray();
        }
        writer.OptionalProperty("limit", _limit);
        if (PhoneView.HasValue && PhoneView.Value != DefaultPhoneView(offered)) writer.Property("phone", CanopyCalendarValues.Name(PhoneView.Value));
        WriteOptionsJson(writer);
        writer.EndObject();
    }

    /// <summary>Writes the chrome, details, sources, creation and view settings that differ from their defaults.</summary>
    private void WriteOptionsJson(CanopyJsonWriter writer) {
        if (Sources.Count > 0) {
            writer.Name("sources").BeginArray();
            foreach (var source in Sources) source.WriteJson(writer);
            writer.EndArray();
        }
        if (!Toolbar) writer.Property("toolbar", false);
        else if (ToolbarItems.Count > 0) {
            writer.Name("toolbar").BeginArray();
            foreach (var item in ToolbarItems) writer.String(CanopyCalendarValues.Name(item));
            writer.EndArray();
        }
        if (Details == CanopyCalendarDetails.Popover) writer.Property("details", "popover");
        if (Create != null) { writer.Name("create"); Create.WriteJson(writer); }
        if (Drop) writer.Property("drop", true);
        if (Occurrence.HasValue && Occurrence.Value != DefaultOccurrence) writer.Property("occurrence", CanopyCalendarValues.Name(Occurrence.Value));
        if (WeekNumbers != CanopyCalendarWeekNumbers.None) writer.Property("weekNumbers", CanopyCalendarValues.Name(WeekNumbers));
        if (!NavLinks) writer.Property("navLinks", false);
        if (_validStart.HasValue || _validEnd.HasValue) {
            writer.Name("validRange").BeginObject();
            if (_validStart.HasValue) writer.Property("start", CanopyCalendarValues.Date(_validStart.Value));
            if (_validEnd.HasValue) writer.Property("end", CanopyCalendarValues.Date(_validEnd.Value));
            writer.EndObject();
        }
        if (FixedWeeks) writer.Property("fixedWeeks", true);
        if (!OutsideDays) writer.Property("outsideDays", false);
        if (Span != null) { writer.Name("span"); Span.WriteJson(writer); }
        if (!Menu) writer.Property("menu", false);
        if (!Hover) writer.Property("hover", false);
        if (YearEvents) writer.Property("yearEvents", true);
        if (AgendaSpan != CanopyCalendarAgendaSpan.Month) writer.Property("agendaSpan", CanopyCalendarValues.Name(AgendaSpan));
        if (_months != 6) writer.Property("months", _months);
        if (Print) writer.Property("print", true);
    }

    /// <summary>What moving an occurrence changes without a setting: ask when override records are possible, else every occurrence.</summary>
    private CanopyCalendarOccurrence DefaultOccurrence => _series != null && _recurrenceId != null ? CanopyCalendarOccurrence.Ask : CanopyCalendarOccurrence.All;

    /// <summary>Whether a views list is the default list, which needs no writing.</summary>
    private bool SameViews(IList<CanopyCalendarView> views) {
        var defaults = new List<CanopyCalendarView>(DefaultViews);
        if (Resources != null) defaults.Add(CanopyCalendarView.Timeline);
        return Same(views, defaults);
    }

    private static bool SameZooms(IList<CanopyCalendarZoom> zooms) => Same(zooms, AllZooms);

    private static bool Same<T>(IList<T> values, IList<T> defaults) {
        if (values.Count != defaults.Count) return false;
        for (var index = 0; index < values.Count; index++) if (!EqualityComparer<T>.Default.Equals(values[index], defaults[index])) return false;
        return true;
    }

    /// <summary>The view phones open in without a setting: the agenda when it is offered.</summary>
    private static CanopyCalendarView? DefaultPhoneView(IList<CanopyCalendarView> offered) => offered.Contains(CanopyCalendarView.Agenda) ? CanopyCalendarView.Agenda : null;
}
