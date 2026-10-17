using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CanopyX.Html;

/// <summary>
/// Reads <c>canopyx-parts.json</c>, the part manifest <c>Build/Sync-Assets.ps1</c> writes from <c>Build/parts.json</c>. The
/// manifest holds objects, arrays, strings and booleans only, so a small reader keeps the package free of a JSON dependency.
/// </summary>
internal static class CanopyPartManifest {
    /// <summary>Returns the entries of the manifest's <c>parts</c> array, each a map of field names to strings, string lists or booleans.</summary>
    internal static IReadOnlyList<IReadOnlyDictionary<string, object>> Read(string json) {
        var position = 0;
        var root = Value(json, ref position) as Dictionary<string, object>;
        Skip(json, ref position);
        if (root == null || position != json.Length || !root.TryGetValue("parts", out var parts) || !(parts is List<object> list)) {
            throw new InvalidOperationException("The CanopyX part manifest is malformed.");
        }

        var entries = new List<IReadOnlyDictionary<string, object>>();
        foreach (var item in list) {
            entries.Add(item as Dictionary<string, object> ?? throw new InvalidOperationException("The CanopyX part manifest is malformed."));
        }

        return entries;
    }

    private static object Value(string json, ref int position) {
        Skip(json, ref position);
        if (position >= json.Length) throw Malformed();
        switch (json[position]) {
            case '{': {
                var map = new Dictionary<string, object>(StringComparer.Ordinal);
                position++;
                Skip(json, ref position);
                if (Peek(json, position) == '}') { position++; return map; }
                while (true) {
                    Skip(json, ref position);
                    var name = Text(json, ref position);
                    Skip(json, ref position);
                    Expect(json, ref position, ':');
                    map[name] = Value(json, ref position);
                    Skip(json, ref position);
                    if (Peek(json, position) == ',') { position++; continue; }
                    Expect(json, ref position, '}');
                    return map;
                }
            }
            case '[': {
                var list = new List<object>();
                position++;
                Skip(json, ref position);
                if (Peek(json, position) == ']') { position++; return list; }
                while (true) {
                    list.Add(Value(json, ref position));
                    Skip(json, ref position);
                    if (Peek(json, position) == ',') { position++; continue; }
                    Expect(json, ref position, ']');
                    return list;
                }
            }
            case '"':
                return Text(json, ref position);
            default:
                if (string.CompareOrdinal(json, position, "true", 0, 4) == 0) { position += 4; return true; }
                if (string.CompareOrdinal(json, position, "false", 0, 5) == 0) { position += 5; return false; }
                throw Malformed();
        }
    }

    private static string Text(string json, ref int position) {
        Expect(json, ref position, '"');
        var builder = new StringBuilder();
        while (position < json.Length && json[position] != '"') {
            var ch = json[position++];
            if (ch != '\\') { builder.Append(ch); continue; }
            if (position >= json.Length) throw Malformed();
            var escape = json[position++];
            switch (escape) {
                case 'n': builder.Append('\n'); break;
                case 't': builder.Append('\t'); break;
                case 'r': builder.Append('\r'); break;
                case 'b': builder.Append('\b'); break;
                case 'f': builder.Append('\f'); break;
                case 'u':
                    if (position + 4 > json.Length) throw Malformed();
                    builder.Append((char)int.Parse(json.Substring(position, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                    position += 4;
                    break;
                default: builder.Append(escape); break;
            }
        }

        Expect(json, ref position, '"');
        return builder.ToString();
    }

    private static void Skip(string json, ref int position) {
        while (position < json.Length && char.IsWhiteSpace(json[position])) position++;
    }

    private static char Peek(string json, int position) => position < json.Length ? json[position] : '\0';

    private static void Expect(string json, ref int position, char expected) {
        if (Peek(json, position) != expected) throw Malformed();
        position++;
    }

    private static InvalidOperationException Malformed() => new InvalidOperationException("The CanopyX part manifest is malformed.");
}
