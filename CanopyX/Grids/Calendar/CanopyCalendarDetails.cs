namespace CanopyX;

/// <summary>What activating an event of a <see cref="CanopyCalendar"/> opens.</summary>
public enum CanopyCalendarDetails {
    /// <summary>The grid's record drawer (<c>drawer</c>). The default.</summary>
    Drawer = 0,

    /// <summary>A small details popover with the title, time, description, status and resource (<c>popover</c>).</summary>
    Popover
}