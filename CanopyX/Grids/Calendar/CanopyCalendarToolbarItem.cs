namespace CanopyX;

/// <summary>A grid toolbar control shown above a <see cref="CanopyCalendar"/> (see <see cref="CanopyCalendar.ToolbarItems"/>).</summary>
public enum CanopyCalendarToolbarItem {
    /// <summary>The search box (<c>search</c>).</summary>
    Search = 0,

    /// <summary>The Filters control (<c>filters</c>).</summary>
    Filters,

    /// <summary>The Columns control (<c>columns</c>).</summary>
    Columns,

    /// <summary>The saved views control (<c>views</c>).</summary>
    Views,

    /// <summary>The Export menu (<c>export</c>).</summary>
    Export,

    /// <summary>The more menu (<c>more</c>).</summary>
    More
}