using System;

namespace CanopyX;

public sealed partial class CanopyCalendar {
    private static readonly CanopyCalendarView[] StandardViews = {
        CanopyCalendarView.Month, CanopyCalendarView.Week, CanopyCalendarView.Day, CanopyCalendarView.Days, CanopyCalendarView.Agenda, CanopyCalendarView.Year
    };

    /// <summary>
    /// Sets the defaults of a preset: the grid toolbar controls, what activating an event opens, the Print button, the views and,
    /// for <see cref="CanopyCalendarPreset.Basic"/> and <see cref="CanopyCalendarPreset.Scheduler"/>, whether events can be
    /// edited and created. Settings changed afterwards override the preset.
    /// </summary>
    /// <param name="preset">The preset.</param>
    /// <returns>This calendar.</returns>
    /// <remarks>With <see cref="Resources"/> (set before or after the preset), <see cref="CanopyCalendarPreset.Basic"/> keeps the
    /// timeline out of the views, and <see cref="CanopyCalendarPreset.Scheduler"/> offers it with a concurrency lane (warning from
    /// 3 events at once, danger from 5). The scheduler's editing and creation need editable start and title columns.</remarks>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="preset"/> is not a known preset.</exception>
    public CanopyCalendar ApplyPreset(CanopyCalendarPreset preset) {
        if (preset < CanopyCalendarPreset.Basic || preset > CanopyCalendarPreset.Scheduler) throw new ArgumentOutOfRangeException(nameof(preset), preset, "Unknown calendar preset.");
        ToolbarItems.Clear();
        Views.Clear();
        _preset = preset;
        switch (preset) {
            case CanopyCalendarPreset.Basic:
                Toolbar = false;
                Details = CanopyCalendarDetails.Popover;
                Print = false;
                Editing = null;
                Create = null;
                Drop = false;
                break;
            case CanopyCalendarPreset.Standard:
                Toolbar = true;
                Items(CanopyCalendarToolbarItem.Search, CanopyCalendarToolbarItem.Filters, CanopyCalendarToolbarItem.Export);
                Details = CanopyCalendarDetails.Popover;
                Print = true;
                foreach (var view in StandardViews) Views.Add(view);
                break;
            default:
                Toolbar = true;
                Items(CanopyCalendarToolbarItem.Search, CanopyCalendarToolbarItem.Filters, CanopyCalendarToolbarItem.Views, CanopyCalendarToolbarItem.Export);
                Details = CanopyCalendarDetails.Drawer;
                Print = true;
                // The default views: month, week, day and agenda, plus the timeline with resources.
                Editing = new CanopyCalendarEditing();
                Create = new CanopyCalendarCreate();
                Capacity = null;
                break;
        }
        if (_resources != null) CompletePreset();
        return this;
    }

    /// <summary>The preset applied last, which resources complete; null for none.</summary>
    private CanopyCalendarPreset? _preset;

    /// <summary>The preset's resource defaults: the basic views without the timeline, the scheduler's concurrency lane.</summary>
    private void CompletePreset() {
        // Without resources the default views are exactly month, week, day and agenda.
        if (_preset == CanopyCalendarPreset.Basic && Views.Count == 0) foreach (var view in DefaultViews) Views.Add(view);
        if (_preset == CanopyCalendarPreset.Scheduler && Capacity == null) Capacity = new CanopyCalendarCapacity().Add(3, CanopyTone.Warning).Add(5, CanopyTone.Danger);
    }

    private void Items(params CanopyCalendarToolbarItem[] items) {
        foreach (var item in items) ToolbarItems.Add(item);
    }
}
