namespace CanopyX;

/// <summary>When a <see cref="CanopyCalendar"/>'s moved and resized events are saved.</summary>
public enum CanopyCalendarCommit {
    /// <summary>Each change is committed as soon as the reader drops the event (<c>auto</c>). The default.</summary>
    Auto = 0,

    /// <summary>Changes wait in the grid's edit bar until the reader saves them (<c>manual</c>).</summary>
    Manual
}
