using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX;

/// <summary>Shared rules of the date-range documents: UTC millisecond instants, the window bound and column bindings.</summary>
internal static class CanopyGridRanges {
    /// <summary>The longest window one range request may span, in days.</summary>
    internal const int MaxDays = 3700;

    /// <summary>The most resource identities one range request may restrict to.</summary>
    internal const int MaxResources = 1000;

    /// <summary>The longest resource identity, in UTF-16 code units.</summary>
    internal const int MaxResourceLength = 4096;

    /// <summary>The informational calendar view names a range request may carry.</summary>
    internal static readonly string[] CalendarViews = { "month", "week", "day", "days", "agenda", "year", "timeline" };

    private static readonly DateTime Earliest = new DateTime(2, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Latest = new DateTime(9998, 12, 31, 23, 59, 59, DateTimeKind.Utc);

    /// <summary>A UTC instant truncated to whole milliseconds; unspecified values are read as UTC, as date cells are.</summary>
    internal static DateTime Instant(DateTime value, string parameter) {
        var utc = value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        utc = new DateTime(utc.Ticks - utc.Ticks % TimeSpan.TicksPerMillisecond, DateTimeKind.Utc);
        if (utc < Earliest || utc > Latest) throw new ArgumentOutOfRangeException(parameter, "A range instant must fall between the years 0002 and 9998.");
        return utc;
    }

    /// <summary>Checks that a window is nonempty and at most <see cref="MaxDays"/> days long.</summary>
    internal static void Window(DateTime from, DateTime to, string parameter) {
        if (from >= to) throw new ArgumentException("A range must end after it starts.", parameter);
        if (to - from > TimeSpan.FromDays(MaxDays)) throw new ArgumentException("A range spans at most 3,700 days.", parameter);
    }

    /// <summary>ISO 8601 UTC, with milliseconds only when they are not zero.</summary>
    internal static string Format(DateTime instant) =>
        instant.ToString(instant.Millisecond == 0 ? "yyyy-MM-dd'T'HH:mm:ss'Z'" : "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>The whole UTC milliseconds of a cell's date value (since 0001-01-01), as the protocol compares dates.</summary>
    internal static long Milliseconds(DateTime value) {
        var utc = value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : value;
        return utc.Ticks / TimeSpan.TicksPerMillisecond;
    }

    /// <summary>Finds a declared column of the expected kind for a range role.</summary>
    internal static CanopyColumn Column(CanopyDataGridView view, string id, CanopyColumnKind kind, string role) {
        foreach (var column in view.Columns) {
            if (column.Id != id) continue;
            if (column.Kind != kind) throw new InvalidOperationException("The range " + role + " column must be a " + kind + " column.");
            return column;
        }
        throw new InvalidOperationException("The range " + role + " column must be declared by the grid.");
    }

    /// <summary>Checks a resource restriction: 1 to 1,000 unique, nonempty, well-formed identities of bounded length.</summary>
    internal static void Resources(IList<string> resources) {
        if (resources.Count > MaxResources) throw new InvalidOperationException("A range restricts to at most 1,000 resources.");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var resource in resources) {
            if (string.IsNullOrEmpty(resource) || resource.Length > MaxResourceLength) throw new InvalidOperationException("Resource identities have 1 to 4,096 characters.");
            for (var i = 0; i < resource.Length; i++) {
                if (char.IsHighSurrogate(resource[i]) && i + 1 < resource.Length && char.IsLowSurrogate(resource[i + 1])) { i++; continue; }
                if (char.IsSurrogate(resource[i])) throw new InvalidOperationException("Resource identities must be well-formed text.");
            }
            if (!seen.Add(resource)) throw new InvalidOperationException("Resource identities must be unique.");
        }
    }
}
