using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Text;

namespace CanopyX.Html.Ui;

// Shared encoding and identity checks for declarative UI fragments. No asset or runtime side effects.
internal static class UiHtml {
    internal static string Encode(string? text) => WebUtility.HtmlEncode(text ?? string.Empty);
    internal static string Bool(bool value) => value ? "true" : "false";
    internal static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);

    internal static string Id(string value, string parameter) {
        if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException("An HTML identity is required.", parameter);
        for (var i = 0; i < value.Length; i++) {
            var c = value[i];
            if (char.IsWhiteSpace(c) || char.IsControl(c))
                throw new ArgumentException("HTML identities cannot contain whitespace or control characters.", parameter);
            if (char.IsHighSurrogate(c) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1])) { i++; continue; }
            if (char.IsSurrogate(c)) throw new ArgumentException("HTML identities must contain valid Unicode.", parameter);
        }
        return value;
    }

    internal static string Text(string value, string parameter) {
        if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException("A visible label is required.", parameter);
        return value;
    }

    internal static void Unique(HashSet<string> ids, string id) {
        Id(id, nameof(id));
        if (!ids.Add(id)) throw new ArgumentException("Duplicate HTML identity: " + id);
    }

    internal static void Index(int index, int count) {
        if (index < 0 || index >= count) throw new ArgumentOutOfRangeException(nameof(index), "Select an existing item.");
    }

    internal static void EnumValue<T>(T value) where T : struct {
        if (!Enum.IsDefined(typeof(T), value)) throw new ArgumentOutOfRangeException(nameof(value));
    }

    internal static string Token<T>(T value) where T : struct {
        EnumValue(value);
        var name = value.ToString()!;
        var result = new StringBuilder();
        foreach (var c in name) {
            if (char.IsUpper(c) && result.Length > 0) result.Append('-');
            result.Append(char.ToLowerInvariant(c));
        }
        return result.ToString();
    }

    internal static void Attribute(StringBuilder html, string name, string? value) {
        if (value != null) html.Append(' ').Append(name).Append("=\"").Append(Encode(value)).Append('"');
    }

    internal static void Span(StringBuilder html, string className, string text, string? part = null) {
        html.Append("<span class=\"").Append(className).Append('"');
        Attribute(html, "data-hfx-part", part);
        html.Append('>').Append(Encode(text)).Append("</span>");
    }
}
