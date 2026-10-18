using System;

namespace CanopyX.Html;

public static partial class CanopyHtmlExtensions {
    /// <summary>Writes a calendar built from events as a host fragment, without including assets (see <see cref="CanopyCalendar.Grid"/>).</summary>
    /// <param name="calendar">The calendar, built from events.</param>
    /// <param name="options">Theme, height, direction and automatic mounting.</param>
    /// <returns>The fragment markup.</returns>
    /// <remarks>Include the data-grid runtime once per page, as for <see cref="ToHtmlFragment(CanopyDataGridView, CanopyHtmlOptions?)"/>.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="calendar"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The calendar was not built from events (it has no grid of its own), or the definition is invalid.</exception>
    public static string ToHtmlFragment(this CanopyCalendar calendar, CanopyHtmlOptions? options = null) => GridOf(calendar).ToHtmlFragment(options);

    /// <summary>Writes a calendar built from events as a complete page with the data-grid runtime (see <see cref="CanopyCalendar.Grid"/>).</summary>
    /// <param name="calendar">The calendar, built from events.</param>
    /// <param name="options">Theme, title, language, direction and asset naming.</param>
    /// <returns>The page markup.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="calendar"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The calendar was not built from events (it has no grid of its own), or the definition is invalid.</exception>
    public static string ToHtmlPage(this CanopyCalendar calendar, CanopyHtmlOptions? options = null) => GridOf(calendar).ToHtmlPage(options);

    /// <summary>Saves a calendar built from events as a complete page, UTF-8, creating its directory when needed (see <see cref="CanopyCalendar.Grid"/>).</summary>
    /// <param name="calendar">The calendar, built from events.</param>
    /// <param name="path">The page path.</param>
    /// <param name="options">Page and asset options.</param>
    /// <exception cref="ArgumentNullException"><paramref name="calendar"/> is null.</exception>
    /// <exception cref="ArgumentException"><paramref name="path"/> is empty.</exception>
    /// <exception cref="InvalidOperationException">The calendar was not built from events (it has no grid of its own), or the definition is invalid.</exception>
    public static void SaveHtmlPage(this CanopyCalendar calendar, string path, CanopyHtmlOptions? options = null) => GridOf(calendar).SaveHtmlPage(path, options);

    private static CanopyDataGridView GridOf(CanopyCalendar calendar) {
        if (calendar == null) throw new ArgumentNullException(nameof(calendar));
        return calendar.Grid ?? throw new InvalidOperationException("Only a calendar built from events has a grid of its own; write the grid whose Calendar this is instead.");
    }
}
