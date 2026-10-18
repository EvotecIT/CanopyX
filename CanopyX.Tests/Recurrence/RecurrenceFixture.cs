using System.Globalization;
using System.Text;

namespace CanopyX.Tests.Recurrence;

/// <summary>
/// Reads tests/fixtures/recurrence-cases.json, the recurrence cases the C# expansion and the browser runtime both check, without a
/// JSON library (net472 has none), and finds the cases' time zones on every framework.
/// </summary>
/// <remarks>This file compiles into CanopyX.Tests (net10.0) and CanopyX.Tests.NetFramework (net472).</remarks>
internal static class RecurrenceFixture {
    private static readonly Lazy<List<Dictionary<string, object?>>> AllCases = new Lazy<List<Dictionary<string, object?>>>(() => {
        var text = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "recurrence-cases.json"), Encoding.UTF8);
        var position = 0;
        var cases = (List<object?>)Read(text, ref position)!;
        return cases.Cast<Dictionary<string, object?>>().ToList();
    });

    internal static IReadOnlyList<Dictionary<string, object?>> Cases => AllCases.Value;

    internal static Dictionary<string, object?> Case(string name) => Cases.Single(item => (string)item["name"]! == name);

    internal static string? Text(Dictionary<string, object?> item, string key) => item.TryGetValue(key, out var value) ? (string?)value : null;

    internal static List<string> Texts(Dictionary<string, object?> item, string key) =>
        item.TryGetValue(key, out var value) && value is List<object?> list ? list.Cast<string>().ToList() : new List<string>();

    /// <summary>A wall time of the fixture, <c>yyyy-MM-ddTHH:mm:ss</c>.</summary>
    internal static DateTime Wall(string text) => DateTime.ParseExact(text, "yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.None);

    internal static string Format(DateTimeOffset occurrence) => occurrence.DateTime.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);

    /// <summary>An IANA zone of the fixture; .NET Framework knows only Windows ids, so the cases' zones are mapped there.</summary>
    internal static TimeZoneInfo Zone(string id) {
#if NET6_0_OR_GREATER
        return TimeZoneInfo.FindSystemTimeZoneById(id);
#else
        switch (id) {
            case "Europe/Warsaw": return TimeZoneInfo.FindSystemTimeZoneById("Central European Standard Time");
            case "America/New_York": return TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
            case "UTC": return TimeZoneInfo.Utc;
            default: throw new InvalidOperationException("Map the zone " + id + " to its Windows id.");
        }
#endif
    }

    private static object? Read(string text, ref int position) {
        Skip(text, ref position);
        var character = text[position];
        if (character == '{') {
            var result = new Dictionary<string, object?>(StringComparer.Ordinal);
            position++;
            Skip(text, ref position);
            if (text[position] == '}') { position++; return result; }
            while (true) {
                Skip(text, ref position);
                var key = ReadString(text, ref position);
                Skip(text, ref position);
                Expect(text, ref position, ':');
                result[key] = Read(text, ref position);
                Skip(text, ref position);
                if (text[position++] == '}') return result;
            }
        }
        if (character == '[') {
            var result = new List<object?>();
            position++;
            Skip(text, ref position);
            if (text[position] == ']') { position++; return result; }
            while (true) {
                result.Add(Read(text, ref position));
                Skip(text, ref position);
                if (text[position++] == ']') return result;
            }
        }
        if (character == '"') return ReadString(text, ref position);
        if (text.Substring(position).StartsWith("null", StringComparison.Ordinal)) { position += 4; return null; }
        if (text.Substring(position).StartsWith("true", StringComparison.Ordinal)) { position += 4; return true; }
        if (text.Substring(position).StartsWith("false", StringComparison.Ordinal)) { position += 5; return false; }
        var start = position;
        while (position < text.Length && "+-.0123456789eE".IndexOf(text[position]) >= 0) position++;
        return double.Parse(text.Substring(start, position - start), CultureInfo.InvariantCulture);
    }

    private static string ReadString(string text, ref int position) {
        Expect(text, ref position, '"');
        var value = new StringBuilder();
        while (text[position] != '"') {
            if (text[position] != '\\') { value.Append(text[position++]); continue; }
            var escape = text[position + 1];
            position += 2;
            switch (escape) {
                case 'n': value.Append('\n'); break;
                case 't': value.Append('\t'); break;
                case 'r': value.Append('\r'); break;
                case 'b': value.Append('\b'); break;
                case 'f': value.Append('\f'); break;
                case 'u': value.Append((char)int.Parse(text.Substring(position, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture)); position += 4; break;
                default: value.Append(escape); break;
            }
        }
        position++;
        return value.ToString();
    }

    private static void Expect(string text, ref int position, char expected) {
        if (text[position] != expected) throw new FormatException("Expected '" + expected + "' at " + position + " of the recurrence fixture.");
        position++;
    }

    private static void Skip(string text, ref int position) {
        while (position < text.Length && char.IsWhiteSpace(text[position])) position++;
    }
}
