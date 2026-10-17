namespace CanopyX;

/// <summary>A figure a resource tree column of a <see cref="CanopyCalendarResources"/> shows for the visible period.</summary>
public enum CanopyCalendarAggregate {
    /// <summary>The number of events (<c>count</c>).</summary>
    Count = 0,

    /// <summary>The busy hours: the time covered by at least one event (<c>busy</c>).</summary>
    Busy,

    /// <summary>The number of overlapping event pairs (<c>overlap</c>).</summary>
    Overlap
}
