using System.Globalization;
using System.Text;

namespace CanopyX.Data.Tests;

/// <summary>A maintenance window or incident of a host: a time range with a nullable end, an optional recurrence and series end.</summary>
public sealed class Slot {
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Host { get; set; }
    public string Kind { get; set; } = string.Empty;
    public DateTime? Starts { get; set; }
    public DateTime? Ends { get; set; }
    public string? Rule { get; set; }
    public DateTime? SeriesEnd { get; set; }
    public int Severity { get; set; }
    public string? Notes { get; set; }
}

/// <summary>A deterministic schedule: markers, events crossing range boundaries, recurring series with and without a series end,
/// empty rules, missing starts, ends before starts and mixed-case resources. Identities are fixed-width text, so ordinal
/// identity order is also the database's key order.</summary>
public static class Schedule {
    public static readonly DateTime Epoch = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
    public static readonly string?[] Hosts = { "host-1", "host-2", "Host-3", "host-4", "HOST-5", "host-6", null };
    private static readonly string[] Rules = { "FREQ=DAILY", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "FREQ=MONTHLY;BYMONTHDAY=1", "FREQ=DAILY;COUNT=10" };
    private static readonly string[] Titles = { "Patch window", "Backup", "Disk incident", "Reboot", "Firmware update", "Network outage" };

    public static List<Slot> Slots(int count, int seed = 3) {
        var random = new Random(seed);
        var slots = new List<Slot>(count);
        for (var i = 1; i <= count; i++) {
            // Whole hours often, so starts and ends fall exactly on range boundaries; whole milliseconds otherwise.
            var start = Epoch.AddHours(random.Next(-24 * 90, 24 * 90));
            if (random.Next(3) == 0) start = start.AddMinutes(random.Next(60)).AddMilliseconds(random.Next(1000));
            DateTime? ends = random.Next(10) switch {
                0 or 1 => null,
                2 => start,
                3 => start.AddHours(-random.Next(1, 48)),
                _ => start.AddMinutes(random.Next(1, 60 * 72))
            };
            var recurring = random.Next(7) == 0;
            var slot = new Slot {
                Id = "evt-" + i.ToString("D5", CultureInfo.InvariantCulture),
                Title = Titles[random.Next(Titles.Length)] + " " + i.ToString(CultureInfo.InvariantCulture),
                Host = Hosts[random.Next(Hosts.Length)],
                Kind = random.Next(3) == 0 ? "incident" : "maintenance",
                Starts = random.Next(25) == 0 ? null : start,
                Ends = ends,
                Rule = recurring ? Rules[random.Next(Rules.Length)] : random.Next(12) == 0 ? string.Empty : null,
                Severity = random.Next(1, 6),
                Notes = random.Next(4) == 0 ? null : "note " + (i % 13).ToString(CultureInfo.InvariantCulture)
            };
            if (recurring && random.Next(5) < 3) slot.SeriesEnd = start.AddDays(random.Next(0, 120)).AddHours(random.Next(0, 3));
            slots.Add(slot);
        }
        return slots;
    }

    public static CanopyDataGridView View() {
        var view = new CanopyDataGridView("schedule", "Schedule") { Source = CanopyGridSource.HostedOffset(), PageSize = 50 };
        view.Columns.Add(new CanopyColumn("title", "Title") { Sortable = true });
        view.Columns.Add(new CanopyColumn("host", "Host") { Sortable = true });
        view.Columns.Add(new CanopyColumn("kind", "Kind") { Sortable = true });
        view.Columns.Add(new CanopyColumn("starts", "Starts") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("ends", "Ends") { Kind = CanopyColumnKind.DateTime });
        view.Columns.Add(new CanopyColumn("rule", "Repeats") { Hidden = true });
        view.Columns.Add(new CanopyColumn("seriesEnd", "Series end") { Kind = CanopyColumnKind.DateTime, Hidden = true });
        view.Columns.Add(new CanopyColumn("severity", "Severity") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("notes", "Notes"));
        foreach (var id in new[] { "title", "host", "kind", "notes" }) view.SearchColumns.Add(id);
        view.Reporting = new CanopyGridReporting { FilterGroups = true };
        return view;
    }

    public static CanopyColumnMap<Slot> Map(CanopyDataGridView? view = null) => new CanopyColumnMap<Slot>(view ?? View())
        .Key(x => x.Id)
        .Column("title", x => x.Title)
        .Column("host", x => x.Host)
        .Column("kind", x => x.Kind)
        // Seeded at whole milliseconds, so the stored start is already a protocol sort key.
        .Column("starts", x => x.Starts, column => column.SortBy(x => x.Starts))
        .Column("ends", x => x.Ends)
        .Column("rule", x => x.Rule)
        .Column("seriesEnd", x => x.SeriesEnd)
        .Column("severity", x => x.Severity)
        .Column("notes", x => x.Notes, column => column.Filterable(false));

    public static Dictionary<string, Func<Slot, object?>> Values() => new Dictionary<string, Func<Slot, object?>> {
        ["title"] = x => x.Title, ["host"] = x => x.Host, ["kind"] = x => x.Kind, ["starts"] = x => x.Starts, ["ends"] = x => x.Ends,
        ["rule"] = x => x.Rule, ["seriesEnd"] = x => x.SeriesEnd, ["severity"] = x => x.Severity, ["notes"] = x => x.Notes
    };

    public static CanopyRemoteHandler Reference(CanopyDataSchema schema, IReadOnlyList<Slot> slots, CanopyRemoteOptions? options = null) =>
        new CanopyRemoteHandler(schema, new CanopyInMemoryProvider<Slot>(schema, () => slots, slot => slot.Id, Values(), () => "r1"), options);

    public static CanopyRemoteHandler Linq(CanopyColumnMap<Slot> map, IReadOnlyList<Slot> slots, CanopyRemoteOptions? options = null) =>
        new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Slot>(slots.AsQueryable(), map, new CanopyQueryOptions { Revision = _ => new ValueTask<string>("r1") }), options);

    public static string Instant(DateTime value) => value.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>A range request with the given window, columns and query parts.</summary>
    public static string Range(DateTime from, DateTime to, string columns = ",\"end\":\"ends\",\"recurrence\":\"rule\",\"seriesEnd\":\"seriesEnd\"", string query = "{}", string extra = "") =>
        "{\"protocol\":\"canopyx/2\",\"type\":\"gridRangeQuery\",\"view\":\"schedule\",\"query\":" + query + ",\"from\":\"" + Instant(from) + "\",\"to\":\"" + Instant(to) +
        "\",\"start\":\"starts\"" + columns + extra + "}";
}

/// <summary>Generates valid random range requests over the schedule: windows that clip events at both ends or sit exactly on
/// starts and ends, optional end, recurrence, series-end and resource columns, resource restrictions, search, predicates,
/// filter groups and limits.</summary>
public sealed class RandomRanges {
    private static readonly string[] Views = { "month", "week", "day", "days", "agenda", "year", "timeline" };
    private readonly Random _random;
    private readonly IReadOnlyList<Slot> _slots;

    public RandomRanges(IReadOnlyList<Slot> slots, int seed) {
        _slots = slots;
        _random = new Random(seed);
    }

    public string Next() {
        var from = Boundary() ?? Schedule.Epoch.AddHours(_random.Next(-24 * 80, 24 * 80));
        var to = _random.Next(6) switch {
            0 => from.AddHours(1),
            1 => from.AddDays(1),
            2 => from.AddDays(7),
            3 => from.AddDays(31),
            4 => from.AddDays(_random.Next(60, 400)),
            _ => Boundary() is DateTime edge && edge > from ? edge : from.AddDays(3)
        };
        var columns = new StringBuilder();
        if (_random.Next(5) != 0) columns.Append(",\"end\":\"ends\"");
        if (_random.Next(5) < 3) {
            columns.Append(",\"recurrence\":\"rule\"");
            if (_random.Next(2) == 0) columns.Append(",\"seriesEnd\":\"seriesEnd\"");
        }
        if (_random.Next(2) == 0) {
            columns.Append(",\"resource\":\"host\"");
            if (_random.Next(3) != 0) {
                var picked = Schedule.Hosts.Where(host => host != null).OrderBy(_ => _random.Next()).Take(_random.Next(1, 4))
                    .Select(host => RandomQueries.Json(_random.Next(3) == 0 ? host!.ToUpperInvariant() : host!)).Distinct();
                columns.Append(",\"resources\":[").Append(string.Join(",", picked)).Append(']');
            }
        }
        var extra = new StringBuilder();
        if (_random.Next(3) == 0) extra.Append(",\"calendarView\":\"").Append(Views[_random.Next(Views.Length)]).Append('"');
        if (_random.Next(4) != 0) extra.Append(",\"limit\":").Append(_random.Next(5) == 0 ? 10000 : _random.Next(1, 40));
        return Schedule.Range(from, to, columns.ToString(), Query(), extra.ToString());
    }

    /// <summary>A start or end of a random slot, so windows begin or end exactly on record boundaries.</summary>
    private DateTime? Boundary() {
        if (_random.Next(3) != 0) return null;
        var slot = _slots[_random.Next(_slots.Count)];
        return (_random.Next(2) == 0 ? slot.Starts : slot.Ends ?? slot.SeriesEnd) ?? slot.Starts;
    }

    private string Query() {
        var builder = new StringBuilder("{\"protocol\":\"canopyx/2\",\"type\":\"gridQuery\",\"view\":\"schedule\",\"offset\":0,\"limit\":100");
        if (_random.Next(4) == 0) builder.Append(",\"revision\":\"r1\"");
        var slot = _slots[_random.Next(_slots.Count)];
        var search = _random.Next(4) switch { 0 => slot.Title.Substring(0, Math.Min(4, slot.Title.Length)), 1 => slot.Host ?? "host", _ => "" };
        builder.Append(",\"search\":").Append(RandomQueries.Json(_random.Next(2) == 0 ? search.ToLowerInvariant() : search));
        if (_random.Next(3) == 0) builder.Append(",\"searchMode\":\"words\"");
        // The query's sort never changes a range answer.
        builder.Append(",\"sort\":[{\"column\":\"severity\",\"direction\":\"").Append(_random.Next(2) == 0 ? "desc" : "asc").Append("\"}]");
        builder.Append(",\"filters\":[").Append(string.Join(",", Enumerable.Range(0, _random.Next(0, 3)).Select(_ => Condition()))).Append(']');
        if (_random.Next(3) == 0) {
            builder.Append(",\"filterGroup\":{\"operator\":\"").Append(_random.Next(2) == 0 ? "and" : "or").Append("\",\"filters\":[")
                .Append(string.Join(",", Enumerable.Range(0, _random.Next(1, 4)).Select(_ => Condition()))).Append("],\"groups\":[]}");
        }
        return builder.Append('}').ToString();
    }

    private string Condition() {
        var slot = _slots[_random.Next(_slots.Count)];
        return _random.Next(6) switch {
            0 => "{\"column\":\"kind\",\"operator\":\"eq\",\"values\":[" + RandomQueries.Json(slot.Kind) + "]}",
            1 => "{\"column\":\"severity\",\"operator\":\"" + (_random.Next(2) == 0 ? "ge" : "lt") + "\",\"values\":[" + slot.Severity.ToString(CultureInfo.InvariantCulture) + "]}",
            2 => slot.Host == null || _random.Next(3) == 0
                ? "{\"column\":\"host\",\"operator\":\"isNull\",\"values\":[]}"
                : "{\"column\":\"host\",\"operator\":\"in\",\"values\":[" + RandomQueries.Json(slot.Host) + ",\"host-6\"]}",
            3 => "{\"column\":\"title\",\"operator\":\"contains\",\"values\":[" + RandomQueries.Json(slot.Title.Substring(0, 3).ToUpperInvariant()) + "]}",
            4 => "{\"column\":\"ends\",\"operator\":\"" + (_random.Next(2) == 0 ? "isNull" : "isNotNull") + "\",\"values\":[]}",
            _ => "{\"column\":\"starts\",\"operator\":\"" + (_random.Next(2) == 0 ? "ge" : "lt") + "\",\"values\":[\"" + Schedule.Instant(slot.Starts ?? Schedule.Epoch) + "\"]}"
        };
    }
}
