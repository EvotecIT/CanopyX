using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SiteDemos.Docs;

/// <summary>Reads the regions between "// docs:begin id" and "// docs:end" from a source file, without their indentation.</summary>
internal static class Snippets {
    internal static Dictionary<string, string> Read(string path) {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        string? id = null;
        var lines = new List<string>();
        foreach (var line in File.ReadAllLines(path)) {
            var trimmed = line.Trim();
            if (trimmed.StartsWith("// docs:begin ", StringComparison.Ordinal)) {
                id = trimmed["// docs:begin ".Length..].Trim();
                lines.Clear();
            } else if (trimmed == "// docs:end" && id != null) {
                result.Add(id, Dedent(lines));
                id = null;
            } else if (id != null) {
                lines.Add(line);
            }
        }

        if (id != null) throw new InvalidOperationException("Snippet " + id + " in " + path + " has no end marker.");
        return result;
    }

    private static string Dedent(List<string> lines) {
        var indent = lines.Where(line => line.Trim().Length > 0).Select(line => line.Length - line.TrimStart().Length).DefaultIfEmpty(0).Min();
        return string.Join("\n", lines.Select(line => line.Length >= indent ? line[indent..] : line.TrimStart())).Trim('\n');
    }
}

/// <summary>Formats a protocol document for reading: small objects and arrays stay on one line, larger ones open up.</summary>
internal static class Json {
    private const int Width = 76;
    private static readonly JsonSerializerOptions Compact = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    internal static string Format(string json) {
        var builder = new StringBuilder();
        Write(builder, JsonNode.Parse(json), 0);
        return builder.ToString();
    }

    private static void Write(StringBuilder builder, JsonNode? node, int depth) {
        var inline = Inline(node);
        if (inline.Length + depth * 2 <= Width || node is not (JsonObject or JsonArray)) {
            builder.Append(inline);
            return;
        }

        var pad = new string(' ', (depth + 1) * 2);
        if (node is JsonObject obj) {
            builder.Append("{\n");
            var i = 0;
            foreach (var (key, value) in obj) {
                builder.Append(pad).Append(JsonSerializer.Serialize(key, Compact)).Append(": ");
                Write(builder, value, depth + 1);
                builder.Append(++i < obj.Count ? ",\n" : "\n");
            }

            builder.Append(' ', depth * 2).Append('}');
        } else if (node is JsonArray array) {
            builder.Append("[\n");
            for (var i = 0; i < array.Count; i++) {
                builder.Append(pad);
                Write(builder, array[i], depth + 1);
                builder.Append(i + 1 < array.Count ? ",\n" : "\n");
            }

            builder.Append(' ', depth * 2).Append(']');
        }
    }

    private static string Inline(JsonNode? node) {
        var text = node == null ? "null" : node.ToJsonString(Compact);
        return text.Replace("\":", "\": ", StringComparison.Ordinal).Replace(",\"", ", \"", StringComparison.Ordinal).Replace(",{", ", {", StringComparison.Ordinal);
    }
}
