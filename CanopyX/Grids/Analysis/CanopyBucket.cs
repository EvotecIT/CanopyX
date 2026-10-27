using System;
using System.Collections.Generic;
using System.Globalization;
using CanopyX.Json;

namespace CanopyX;

/// <summary>An immutable, bounded calendar or numeric partition shared by grouping and facets.</summary>
/// <remarks>Keys are finite numbers ordered chronologically. Calendar input is an instant; UTC is the default.
/// Numeric intervals include their lower boundary and exclude their upper boundary. Missing input stays missing.</remarks>
public sealed class CanopyBucket {
    private readonly double[] _edges;
    private readonly TimeZoneInfo? _zone;

    private CanopyBucket(CanopyBucketKind kind, string timeZone, DayOfWeek firstWeekday, double width, double origin, double[] edges, TimeZoneInfo? zone = null) {
        Kind = kind; TimeZone = timeZone; FirstWeekday = firstWeekday; Width = width; Origin = origin; _edges = edges;
        _zone = zone;
    }

    /// <summary>Creates a calendar bucket in UTC or a named time zone.</summary>
    /// <param name="kind">Day, week, month, quarter, year, hour or weekday.</param>
    /// <param name="timeZone">A time-zone identifier accepted by the host and browser; UTC by default.</param>
    /// <param name="firstWeekday">First day of a week and the first weekday category; Monday by default.</param>
    /// <returns>The immutable partition.</returns>
    public static CanopyBucket Calendar(CanopyBucketKind kind, string timeZone = "UTC", DayOfWeek firstWeekday = DayOfWeek.Monday) {
        if (kind < CanopyBucketKind.Day || kind > CanopyBucketKind.Weekday) throw new ArgumentOutOfRangeException(nameof(kind));
        if (!Enum.IsDefined(typeof(DayOfWeek), firstWeekday)) throw new ArgumentOutOfRangeException(nameof(firstWeekday));
        if (string.IsNullOrWhiteSpace(timeZone) || timeZone.Length > 128) throw new ArgumentException("A calendar bucket needs a bounded time zone.", nameof(timeZone));
        return Calendar(kind, TimeZoneInfo.FindSystemTimeZoneById(timeZone), timeZone, firstWeekday);
    }

    /// <summary>Creates a calendar bucket with an explicit native zone and its browser time-zone identifier.</summary>
    /// <param name="kind">Day, week, month, quarter, year, hour or weekday.</param>
    /// <param name="zone">The host's native time-zone rules, including daylight-saving transitions.</param>
    /// <param name="timeZone">The corresponding browser identifier, normally an IANA identifier.</param>
    /// <param name="firstWeekday">First weekday; Monday by default.</param>
    /// <returns>The immutable partition. This overload supports hosts whose native zone identifiers differ from browser identifiers.</returns>
    public static CanopyBucket Calendar(CanopyBucketKind kind, TimeZoneInfo zone, string timeZone, DayOfWeek firstWeekday = DayOfWeek.Monday) {
        if (zone == null) throw new ArgumentNullException(nameof(zone));
        if (kind < CanopyBucketKind.Day || kind > CanopyBucketKind.Weekday) throw new ArgumentOutOfRangeException(nameof(kind));
        if (!Enum.IsDefined(typeof(DayOfWeek), firstWeekday)) throw new ArgumentOutOfRangeException(nameof(firstWeekday));
        if (string.IsNullOrWhiteSpace(timeZone) || timeZone.Length > 128) throw new ArgumentException("A calendar bucket needs a bounded browser time zone.", nameof(timeZone));
        return new CanopyBucket(kind, timeZone, firstWeekday, 0, 0, Array.Empty<double>(), zone);
    }

    /// <summary>Creates equal-width half-open numeric intervals.</summary>
    /// <param name="width">Positive finite interval width.</param>
    /// <param name="origin">Finite interval anchor; zero by default.</param>
    /// <returns>The immutable partition.</returns>
    public static CanopyBucket FixedWidth(double width, double origin = 0) {
        if (!Finite(width) || width <= 0) throw new ArgumentOutOfRangeException(nameof(width));
        if (!Finite(origin)) throw new ArgumentOutOfRangeException(nameof(origin));
        return new CanopyBucket(CanopyBucketKind.Width, "UTC", DayOfWeek.Monday, width, origin, Array.Empty<double>());
    }

    /// <summary>Creates half-open numeric intervals, including an underflow and overflow interval.</summary>
    /// <param name="edges">One to 200 strictly ascending finite boundaries.</param>
    /// <returns>The immutable partition.</returns>
    public static CanopyBucket ExplicitEdges(params double[] edges) {
        if (edges == null) throw new ArgumentNullException(nameof(edges));
        if (edges.Length == 0 || edges.Length > 200) throw new ArgumentException("A range has one to 200 edges.", nameof(edges));
        for (var i = 0; i < edges.Length; i++)
            if (!Finite(edges[i]) || i > 0 && edges[i] <= edges[i - 1]) throw new ArgumentException("Range edges must be finite and strictly ascending.", nameof(edges));
        return new CanopyBucket(CanopyBucketKind.Edges, "UTC", DayOfWeek.Monday, 0, 0, (double[])edges.Clone());
    }

    /// <summary>Gets the partition kind.</summary>
    public CanopyBucketKind Kind { get; }
    /// <summary>Gets the time zone used before reading calendar parts.</summary>
    public string TimeZone { get; }
    /// <summary>Gets the first weekday of weeks and weekday categories.</summary>
    public DayOfWeek FirstWeekday { get; }
    /// <summary>Gets the width of an equal-width numeric partition, or zero.</summary>
    public double Width { get; }
    /// <summary>Gets the origin of an equal-width numeric partition.</summary>
    public double Origin { get; }
    /// <summary>Gets a read-only copy of the explicit numeric boundaries.</summary>
    public IReadOnlyList<double> Edges => Array.AsReadOnly(_edges);

    /// <summary>Returns the numeric key of a calendar instant or numeric value; null and non-finite numbers stay missing.</summary>
    /// <param name="value">A DateTime/DateTimeOffset for a calendar bucket, or a numeric value for a range.</param>
    /// <returns>The ordered key, or null for missing input.</returns>
    public double? Key(object? value) {
        if (value == null) return null;
        if (Kind >= CanopyBucketKind.Width) {
            var number = CanopyNumericValues.ToDouble(value);
            if (!Finite(number)) return null;
            if (Kind == CanopyBucketKind.Width) {
                var key = Math.Floor((number - Origin) / Width);
                return Finite(key) && Math.Abs(key) <= 9007199254740991d ? key : throw new ArgumentOutOfRangeException(nameof(value), "The bucket index exceeds binary64's safe integer range.");
            }
            var index = 0;
            while (index < _edges.Length && number >= _edges[index]) index++;
            return index;
        }
        var instant = value is DateTimeOffset offset ? offset : value is DateTime date ? new DateTimeOffset(date.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(date, DateTimeKind.Utc) : date) :
            throw new ArgumentException("A calendar bucket reads an instant.", nameof(value));
        var local = TimeZoneInfo.ConvertTime(instant, _zone!);
        var day = (int)(local.Date.Ticks / TimeSpan.TicksPerDay);
        switch (Kind) {
            case CanopyBucketKind.Day: return day;
            case CanopyBucketKind.Week: return Math.Floor((day - ((int)FirstWeekday + 6) % 7) / 7d);
            case CanopyBucketKind.Month: return (local.Year - 1) * 12 + local.Month - 1;
            case CanopyBucketKind.Quarter: return (local.Year - 1) * 4 + (local.Month - 1) / 3;
            case CanopyBucketKind.Year: return local.Year;
            case CanopyBucketKind.Hour: return local.Hour;
            default: return ((int)local.DayOfWeek - (int)FirstWeekday + 7) % 7;
        }
    }

    /// <summary>Formats a bucket key without changing its numeric ordering.</summary>
    /// <param name="key">A key returned by this partition.</param>
    /// <param name="culture">Culture for weekday and month names; invariant by default.</param>
    /// <returns>The calendar label or numeric interval.</returns>
    public string Label(double key, CultureInfo? culture = null) {
        if (!Finite(key) || key != Math.Floor(key)) throw new ArgumentOutOfRangeException(nameof(key));
        culture ??= CultureInfo.InvariantCulture;
        string Number(double value) => value.ToString("G17", culture);
        if (Kind == CanopyBucketKind.Width) return "[" + Number(Origin + key * Width) + ", " + Number(Origin + (key + 1) * Width) + ")";
        if (Kind == CanopyBucketKind.Edges) {
            if (key < 0 || key > _edges.Length) throw new ArgumentOutOfRangeException(nameof(key));
            var index = (int)key;
            return index == 0 ? "< " + Number(_edges[0]) : index == _edges.Length ? "≥ " + Number(_edges[index - 1]) : "[" + Number(_edges[index - 1]) + ", " + Number(_edges[index]) + ")";
        }
        if (Kind == CanopyBucketKind.Hour) return ((int)key).ToString("D2", culture) + ":00";
        if (Kind == CanopyBucketKind.Weekday) return culture.DateTimeFormat.GetDayName((DayOfWeek)(((int)key + (int)FirstWeekday) % 7));
        if (Kind == CanopyBucketKind.Year) return key.ToString("0", culture);
        if (Kind == CanopyBucketKind.Month) return new DateTime((int)key / 12 + 1, (int)key % 12 + 1, 1).ToString("yyyy-MM", culture);
        if (Kind == CanopyBucketKind.Quarter) return ((int)key / 4 + 1).ToString(culture) + " Q" + ((int)key % 4 + 1).ToString(culture);
        var start = new DateTime(checked((long)(Kind == CanopyBucketKind.Week ? key * 7 + ((int)FirstWeekday + 6) % 7 : key) * TimeSpan.TicksPerDay));
        if (Kind != CanopyBucketKind.Week) return start.ToString("yyyy-MM-dd", culture);
        // The fourth day names the week year, including the ISO year boundary when Monday is first.
        var middle = start.AddDays(3);
        var week = culture.Calendar.GetWeekOfYear(middle, CalendarWeekRule.FirstFourDayWeek, FirstWeekday);
        return middle.Year.ToString("D4", culture) + "-W" + week.ToString("D2", culture);
    }

    internal static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    internal TimeZoneInfo? NativeZone => _zone;
    internal void Validate(CanopyColumn column) {
        if (column.Kind != (Kind >= CanopyBucketKind.Width ? CanopyColumnKind.Number : CanopyColumnKind.DateTime))
            throw new InvalidOperationException("A bucket requires a matching number or date column.");
    }
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("kind", Kind.ToString().ToLowerInvariant());
        if (Kind < CanopyBucketKind.Width) writer.Property("timeZone", TimeZone).Property("firstWeekday", (int)FirstWeekday);
        else if (Kind == CanopyBucketKind.Width) writer.Name("width").Number(Width).Name("origin").Number(Origin);
        else { writer.Name("edges").BeginArray(); foreach (var edge in _edges) writer.Number(edge); writer.EndArray(); }
        writer.EndObject();
    }

    internal static int CompareKeys(object? left, object? right, bool descending) {
        if (left == null || right == null) return left == right ? 0 : left == null ? 1 : -1;
        var order = CanopyNumericValues.ToDouble(left).CompareTo(CanopyNumericValues.ToDouble(right));
        return descending ? -order : order;
    }
}
