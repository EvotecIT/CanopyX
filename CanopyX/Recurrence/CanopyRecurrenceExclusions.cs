using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX;

/// <summary>The excluded occurrences of a series (<c>EXDATE</c>): moments and whole days.</summary>
internal sealed class CanopyRecurrenceExclusions {
    private static readonly CanopyRecurrenceExclusions None = new CanopyRecurrenceExclusions();
    private static readonly char[] Separators = { ',', ';', ' ', '\t', '\r', '\n' };
    private const int MaxExceptions = 1000;
    private static readonly string[] OffsetFormats = { "yyyy-MM-dd'T'HH:mm:ssK", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFFK", "yyyy-MM-dd'T'HH:mmK" };
    private static readonly string[] WallFormats = { "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF", "yyyy-MM-dd'T'HH:mm" };

    private readonly HashSet<long> _instants = new HashSet<long>();
    private readonly HashSet<DateTime> _dates = new HashSet<DateTime>();

    /// <summary>
    /// Reads an exceptions column's text: ISO instants (without an offset, a wall time in the series' zone) and <c>yyyy-MM-dd</c>
    /// dates, separated by commas, semicolons or white space; at most 1000, as the browser reads them.
    /// </summary>
    internal static CanopyRecurrenceExclusions Parse(string? text, TimeZoneInfo zone) {
        if (string.IsNullOrWhiteSpace(text)) return None;
        var result = new CanopyRecurrenceExclusions();
        var tokens = text!.Split(Separators, StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length > MaxExceptions) throw new FormatException("A series takes at most 1000 exceptions.");
        foreach (var token in tokens) {
            if (token.IndexOf('T') < 0) {
                if (!DateTime.TryParseExact(token, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) throw Invalid(token);
                result._dates.Add(date);
                continue;
            }
            var time = token.Substring(token.IndexOf('T'));
            if (time.EndsWith("Z", StringComparison.Ordinal) || time.IndexOf('+') >= 0 || time.IndexOf('-') >= 0) {
                if (!DateTimeOffset.TryParseExact(token, OffsetFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var instant)) throw Invalid(token);
                result._instants.Add(instant.UtcTicks);
            } else {
                if (!DateTime.TryParseExact(token, WallFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var wall)) throw Invalid(token);
                result._instants.Add(CanopyRecurrenceZone.Resolve(wall, zone).UtcTicks);
            }
        }
        return result;
    }

    /// <summary>Whether an occurrence that starts at <paramref name="occurrence"/>, on <paramref name="date"/> in the series' zone, is excluded.</summary>
    internal bool Removes(DateTimeOffset occurrence, DateTime date) => _instants.Contains(occurrence.UtcTicks) || _dates.Contains(date);

    private static FormatException Invalid(string token) => new FormatException("An exception is neither an ISO date-time nor a yyyy-MM-dd date" + (token.Length <= 40 ? ": " + token : "."));
}
