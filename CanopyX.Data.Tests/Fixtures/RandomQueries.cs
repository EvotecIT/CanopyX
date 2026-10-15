using System.Globalization;
using System.Text;

namespace CanopyX.Data.Tests;

/// <summary>Generates valid random wire queries over the fleet view, so providers can be compared with the reference.</summary>
public sealed class RandomQueries {
    private static readonly string[] TextOperators = { "eq", "ne", "contains", "startsWith", "in", "isNull", "isNotNull" };
    private static readonly string[] RangeOperators = { "eq", "ne", "in", "gt", "ge", "lt", "le", "isNull", "isNotNull" };
    private static readonly string[] SortColumns = { "site", "os", "cores", "memory", "online", "lastSeen", "owner" };
    private readonly Random _random;
    private readonly IReadOnlyList<Host> _hosts;

    public RandomQueries(IReadOnlyList<Host> hosts, int seed) {
        _hosts = hosts;
        _random = new Random(seed);
    }

    /// <summary>A gridQuery document. The last sort key is the unique name, so the order is total without the record key.</summary>
    public string Query(int maxOffset, bool search = true, bool sortGroupingFirst = false) {
        var builder = new StringBuilder("{\"protocol\":\"canopyx/2\",\"type\":\"gridQuery\",\"view\":\"fleet\"");
        builder.Append(",\"offset\":").Append(_random.Next(0, maxOffset + 1)).Append(",\"limit\":").Append(_random.Next(1, 60));
        builder.Append(",\"search\":").Append(Json(search && _random.Next(3) == 0 ? SearchText() : ""));
        if (_random.Next(2) == 0) builder.Append(",\"searchMode\":\"words\"");
        builder.Append(",\"sort\":[");
        var sorts = SortColumns.OrderBy(_ => _random.Next()).Take(_random.Next(0, 3)).ToList();
        if (sortGroupingFirst) { sorts.Remove("site"); sorts.Insert(0, "site"); }
        sorts.Add("name");
        builder.Append(string.Join(",", sorts.Select(id => "{\"column\":\"" + id + "\",\"direction\":\"" + (_random.Next(2) == 0 ? "asc" : "desc") + "\"}")));
        builder.Append("],\"filters\":[");
        builder.Append(string.Join(",", Enumerable.Range(0, _random.Next(0, 3)).Select(_ => Condition())));
        builder.Append(']');
        if (_random.Next(3) == 0) builder.Append(",\"filterGroup\":").Append(Group(1));
        return builder.Append('}').ToString();
    }

    private string Group(int depth) {
        var filters = Enumerable.Range(0, _random.Next(1, 4)).Select(_ => Condition()).ToList();
        var groups = depth < 3 && _random.Next(3) == 0 ? new List<string> { Group(depth + 1) } : new List<string>();
        return "{\"operator\":\"" + (_random.Next(2) == 0 ? "and" : "or") + "\",\"filters\":[" + string.Join(",", filters) + "],\"groups\":[" + string.Join(",", groups) + "]}";
    }

    private string Condition() {
        var host = _hosts[_random.Next(_hosts.Count)];
        switch (_random.Next(8)) {
            case 0: return Text("name", host.Name, true);
            case 1: return Text("site", host.Site, true);
            case 2: return Text("os", host.Os.ToString(), true);
            case 3: return Text("owner", host.Owner?.Name, true);
            case 4: return Text("online", null, false, host.Online);
            case 5: return Range("cores", host.Cores?.ToString(CultureInfo.InvariantCulture) ?? "8", () => (1 << _random.Next(7)).ToString(CultureInfo.InvariantCulture), true);
            case 6: return Range("memory", host.Memory.ToString("R", CultureInfo.InvariantCulture), () => Math.Round(_random.NextDouble() * 512, 1).ToString("R", CultureInfo.InvariantCulture), false);
            default:
                var seen = host.LastSeen ?? Fleet.Epoch;
                return Range("lastSeen", Json(seen.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture)),
                    () => Json(Fleet.Epoch.AddHours(-_random.Next(0, 24 * 90)).ToString("yyyy-MM-dd'T'HH:mm:ss'+02:00'", CultureInfo.InvariantCulture)), false);
        }
    }

    private string Text(string column, string? sample, bool text, bool flag = false) {
        var op = TextOperators[_random.Next(TextOperators.Length)];
        if (!text && (op == "contains" || op == "startsWith")) op = "eq";
        var operand = text ? Json(Vary(sample ?? "team")) : flag ? "true" : "false";
        if (op == "contains" || op == "startsWith") operand = Json(Vary(Slice(sample ?? "a")));
        var values = op == "isNull" || op == "isNotNull" ? "" : op == "in" ? operand + "," + (text ? Json(Vary(_hosts[_random.Next(_hosts.Count)].Name)) : "true") : operand;
        return "{\"column\":\"" + column + "\",\"operator\":\"" + op + "\",\"values\":[" + values + "]}";
    }

    private string Range(string column, string sample, Func<string> other, bool fractional) {
        var op = RangeOperators[_random.Next(RangeOperators.Length)];
        var operand = _random.Next(3) == 0 ? other() : sample;
        if (fractional && _random.Next(4) == 0) operand = (double.Parse(operand, CultureInfo.InvariantCulture) + 0.5).ToString("R", CultureInfo.InvariantCulture);
        var values = op == "isNull" || op == "isNotNull" ? "" : op == "in" ? operand + "," + other() : operand;
        return "{\"column\":\"" + column + "\",\"operator\":\"" + op + "\",\"values\":[" + values + "]}";
    }

    private string SearchText() {
        var host = _hosts[_random.Next(_hosts.Count)];
        return _random.Next(4) switch {
            0 => Vary(Slice(host.Name)),
            1 => Vary(host.Site ?? "50%"),
            2 => "\"" + Slice(host.Owner?.Name ?? "team") + "\" " + Slice(host.Os.ToString()),
            _ => Slice(host.Notes ?? "_")
        };
    }

    private string Slice(string text) {
        if (text.Length <= 1) return text;
        var start = _random.Next(text.Length - 1);
        return text.Substring(start, _random.Next(1, Math.Min(5, text.Length - start) + 1));
    }

    private string Vary(string text) => _random.Next(3) switch { 0 => text.ToUpperInvariant(), 1 => text.ToLowerInvariant(), _ => text };

    public static string Json(string text) {
        var builder = new StringBuilder("\"");
        foreach (var unit in text) {
            if (unit == '"' || unit == '\\') builder.Append('\\').Append(unit);
            else if (unit < 32) builder.Append("\\u").Append(((int)unit).ToString("x4", CultureInfo.InvariantCulture));
            else builder.Append(unit);
        }
        return builder.Append('"').ToString();
    }
}
