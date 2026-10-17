namespace CanopyX;

/// <summary>A zoom level of a <see cref="CanopyCalendar"/>'s resource timeline: the unit of its time axis.</summary>
public enum CanopyCalendarZoom {
    /// <summary>Hours (<c>hour</c>).</summary>
    Hour = 0,

    /// <summary>Days (<c>day</c>). The default.</summary>
    Day,

    /// <summary>Weeks (<c>week</c>).</summary>
    Week,

    /// <summary>Months (<c>month</c>).</summary>
    Month,

    /// <summary>Quarters (<c>quarter</c>).</summary>
    Quarter
}
