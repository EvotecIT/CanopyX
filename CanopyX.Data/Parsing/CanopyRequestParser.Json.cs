using System.Text.Json;

namespace CanopyX.Data;

public static partial class CanopyRequestParser {
    private static void Envelope(JsonElement root, string type) {
        var protocol = OptionalString(root, "protocol");
        if (protocol != null && protocol != Protocol) throw CanopyRequestException.Document("The request uses another protocol version.");
        var actual = OptionalString(root, "type");
        if (actual != null && actual != type) throw CanopyRequestException.Document("The request has the wrong document type.");
    }

    private static JsonElement RequireObject(JsonElement element, string what) {
        if (element.ValueKind != JsonValueKind.Object) throw CanopyRequestException.Document("The " + what + " must be a JSON object.");
        return element;
    }

    private static string RequireString(JsonElement element, string name) =>
        OptionalString(element, name) ?? throw CanopyRequestException.Document("The field '" + name + "' is required.");

    private static string? OptionalString(JsonElement element, string name) {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null) return null;
        if (value.ValueKind != JsonValueKind.String) throw new CanopyRequestException(CanopyRequestError.InvalidJson, "The field '" + name + "' must be text.");
        return value.GetString();
    }

    private static int? OptionalInteger(JsonElement element, string name) {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null) return null;
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var number))
            throw new CanopyRequestException(CanopyRequestError.InvalidJson, "The field '" + name + "' must be an integer.");
        return number;
    }

    private static bool? OptionalBoolean(JsonElement element, string name) {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null) return null;
        if (value.ValueKind == JsonValueKind.True) return true;
        if (value.ValueKind == JsonValueKind.False) return false;
        throw new CanopyRequestException(CanopyRequestError.InvalidJson, "The field '" + name + "' must be true or false.");
    }

    /// <summary>Identifiers are nonempty, at most 4,096 code units and well-formed UTF-16.</summary>
    internal static void RequireIdentifier(string text, string what) {
        if (text.Length == 0 || text.Length > 4096) throw CanopyRequestException.Document("The " + what + " must have 1 to 4,096 characters.");
        for (var i = 0; i < text.Length; i++) {
            if (char.IsHighSurrogate(text[i]) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1])) { i++; continue; }
            if (char.IsSurrogate(text[i])) throw CanopyRequestException.Document("The " + what + " must be well-formed text.");
        }
    }
}
