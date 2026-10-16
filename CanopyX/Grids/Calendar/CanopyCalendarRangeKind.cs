namespace CanopyX;

/// <summary>How a <see cref="CanopyCalendarRange"/> is drawn.</summary>
public enum CanopyCalendarRangeKind {
    /// <summary>A shaded background behind the events, for holidays, freezes or maintenance windows (<c>background</c>). The default.</summary>
    Background = 0,

    /// <summary>A hatched time the resource cannot take events; editing refuses drops into it (<c>unavailable</c>).</summary>
    Unavailable
}
