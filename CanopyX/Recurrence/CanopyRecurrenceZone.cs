using System;

namespace CanopyX;

/// <summary>Wall-clock times of a series' time zone as moments, the way RFC 5545 resolves daylight saving changes.</summary>
internal static class CanopyRecurrenceZone {
    /// <summary>
    /// The moment a wall time means in a zone: a time the clocks skip keeps the offset before the change (02:30 becomes 03:30),
    /// and a time that occurs twice means the first of them. The result carries the zone's offset at that moment.
    /// </summary>
    internal static DateTimeOffset Resolve(DateTime wall, TimeZoneInfo zone) {
        wall = DateTime.SpecifyKind(wall, DateTimeKind.Unspecified);
        TimeSpan offset;
        if (zone.IsInvalidTime(wall)) offset = OffsetBefore(wall, zone);
        else if (zone.IsAmbiguousTime(wall)) offset = Largest(zone.GetAmbiguousTimeOffsets(wall));
        else offset = zone.GetUtcOffset(wall);
        return TimeZoneInfo.ConvertTime(new DateTimeOffset(wall, offset), zone);
    }

    /// <summary>The offset in force just before the gap a skipped wall time falls in.</summary>
    private static TimeSpan OffsetBefore(DateTime wall, TimeZoneInfo zone) {
        for (var step = 1; step <= 96; step++) {
            var earlier = wall.AddMinutes(-15 * step);
            if (zone.IsInvalidTime(earlier)) continue;
            return zone.IsAmbiguousTime(earlier) ? Largest(zone.GetAmbiguousTimeOffsets(earlier)) : zone.GetUtcOffset(earlier);
        }
        return zone.BaseUtcOffset;
    }

    private static TimeSpan Largest(TimeSpan[] offsets) {
        var largest = offsets[0];
        foreach (var offset in offsets) if (offset > largest) largest = offset;
        return largest;
    }
}
