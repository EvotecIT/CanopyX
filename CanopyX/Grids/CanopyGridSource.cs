using System;

namespace CanopyX;

/// <summary>Declares coherent flat-grid data and navigation modes. Hosts provide data hooks separately.</summary>
public sealed class CanopyGridSource {
    private CanopyGridSource(CanopyGridSourceKind kind, CanopyGridNavigation navigation) {
        Kind = kind;
        Navigation = navigation;
    }

    /// <summary>Gets whether the complete dataset is inline or supplied by a host.</summary>
    public CanopyGridSourceKind Kind { get; }

    /// <summary>Gets known-count offset access or opaque sequential cursor access.</summary>
    public CanopyGridNavigation Navigation { get; }

    /// <summary>Gets the address an inline grid reads its rows from, or null when the view carries them.</summary>
    public string? Url { get; private set; }

    /// <summary>Gets how often the rows at <see cref="Url"/> are read again, or null to read them once.</summary>
    public TimeSpan? Refresh { get; private set; }

    /// <summary>Declares a complete inline dataset with local filtering and ordering.</summary>
    /// <returns>An inline source; the view supplies its rows.</returns>
    public static CanopyGridSource Inline() => new CanopyGridSource(CanopyGridSourceKind.Inline, CanopyGridNavigation.Offset);

    /// <summary>Declares host-owned full-query results with known counts and random offset access.</summary>
    /// <returns>A host source for continuous or paged presentation.</returns>
    public static CanopyGridSource HostedOffset() => new CanopyGridSource(CanopyGridSourceKind.Host, CanopyGridNavigation.Offset);

    /// <summary>Declares host-owned sequential cursor pages, whose counts may be unknown.</summary>
    /// <returns>A cursor source that makes its owning view use paged presentation.</returns>
    public static CanopyGridSource HostedCursor() => new CanopyGridSource(CanopyGridSourceKind.Host, CanopyGridNavigation.Cursor);

    /// <summary>
    /// Declares an inline grid whose rows a page reads once from a JSON address (an array of rows, or an object with a
    /// <c>rows</c> array, in the view's row format), for static pages without a hosted endpoint. Search, sorting, filters
    /// and exports then work on those rows in the browser. Files opened from disk cannot fetch; serve the page over HTTP.
    /// </summary>
    /// <param name="url">An http(s) or relative address of at most 2,048 characters, read with same-origin credentials.</param>
    /// <param name="refresh">How often to read the rows again, from 5 seconds to a day; null reads them once.</param>
    /// <returns>An inline source; the view's own rows stay empty.</returns>
    public static CanopyGridSource FromUrl(string url, TimeSpan? refresh = null) {
        if (!IsSafeUrl(url)) throw new ArgumentException("A row address must be an http(s) or relative address of 1 to 2,048 characters without control characters.", nameof(url));
        if (refresh.HasValue && (refresh.Value < TimeSpan.FromSeconds(5) || refresh.Value > TimeSpan.FromDays(1) || refresh.Value.Ticks % TimeSpan.TicksPerSecond != 0))
            throw new ArgumentOutOfRangeException(nameof(refresh), "A refresh interval is a whole number of seconds from 5 seconds to one day.");
        return new CanopyGridSource(CanopyGridSourceKind.Inline, CanopyGridNavigation.Offset) { Url = url, Refresh = refresh };
    }

    internal int? RefreshSeconds => Refresh.HasValue ? (int)(Refresh.Value.Ticks / TimeSpan.TicksPerSecond) : null;

    private static bool IsSafeUrl(string? url) {
        if (url == null || url.Trim().Length == 0 || url.Length > 2048) return false;
        foreach (var character in url) if (char.IsControl(character)) return false;
        var trimmed = url.Trim();
        if (trimmed.StartsWith("//", StringComparison.Ordinal) || trimmed.IndexOf('\\') >= 0) return false;
        var colon = trimmed.IndexOf(':');
        var slash = trimmed.IndexOfAny(new[] { '/', '?', '#' });
        if (colon < 0 || slash >= 0 && slash < colon) return true;
        var scheme = trimmed.Substring(0, colon);
        return scheme.Equals("http", StringComparison.OrdinalIgnoreCase) || scheme.Equals("https", StringComparison.OrdinalIgnoreCase);
    }
}
