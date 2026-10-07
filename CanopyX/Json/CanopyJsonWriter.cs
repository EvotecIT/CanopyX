using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CanopyX.Json;

/// <summary>
/// Minimal forward-only JSON writer used for every <c>canopyx/2</c> document.
/// </summary>
/// <remarks>
/// CanopyX targets <c>net472</c> and <c>netstandard2.0</c> without runtime package dependencies, so it cannot use
/// <c>System.Text.Json</c>. The writer is deterministic (invariant culture, no whitespace) and HTML-safe: it escapes
/// <c>&lt;</c>, <c>&gt;</c>, <c>&amp;</c>, U+2028 and U+2029 so the output can be embedded in a
/// <c>&lt;script&gt;</c> element or a sidecar script without further encoding. It also escapes the backtick and a
/// <c>$</c> before <c>{</c>, so a document can sit inside a JavaScript template literal unchanged (bundle packs).
/// </remarks>
internal sealed class CanopyJsonWriter {
    private static readonly char[] Hex = "0123456789abcdef".ToCharArray();

    /// <summary>The ASCII characters <see cref="AppendString"/> escapes; <c>$</c> only before <c>{</c>.</summary>
    private static readonly bool[] EscapedAscii = CreateEscapedAscii();

    private readonly StringBuilder _builder;
    /// <summary>Whether each open array or object, innermost last, holds an item yet.</summary>
    private bool[] _hasItems = new bool[16];
    private int _depth;
    private bool _afterPropertyName;
    private bool _hasRoot;

    internal CanopyJsonWriter(int capacity = 256) {
        _builder = new StringBuilder(capacity);
    }

    internal int Length => _builder.Length;

    internal CanopyJsonWriter BeginObject() {
        BeforeValue();
        _builder.Append('{');
        Push();
        return this;
    }

    internal CanopyJsonWriter EndObject() {
        Pop();
        _builder.Append('}');
        return this;
    }

    internal CanopyJsonWriter BeginArray() {
        BeforeValue();
        _builder.Append('[');
        Push();
        return this;
    }

    internal CanopyJsonWriter EndArray() {
        Pop();
        _builder.Append(']');
        return this;
    }

    internal CanopyJsonWriter Name(string name) {
        if (_depth == 0) {
            throw new InvalidOperationException("A property name must be written inside an object.");
        }

        if (_hasItems[_depth - 1]) {
            _builder.Append(',');
        } else {
            _hasItems[_depth - 1] = true;
        }

        AppendString(name);
        _builder.Append(':');
        _afterPropertyName = true;
        return this;
    }

    internal CanopyJsonWriter String(string? value) {
        if (value == null) {
            return Null();
        }

        BeforeValue();
        AppendString(value);
        return this;
    }

    internal CanopyJsonWriter Number(long value) {
        RequireSafeMagnitude((decimal)value);
        BeforeValue();
#if NETCOREAPP3_0_OR_GREATER
        Span<char> digits = stackalloc char[20];
        value.TryFormat(digits, out var written, default, CultureInfo.InvariantCulture);
        _builder.Append(digits.Slice(0, written));
#else
        _builder.Append(value.ToString(CultureInfo.InvariantCulture));
#endif
        return this;
    }

    internal CanopyJsonWriter Number(double value) {
        if (double.IsNaN(value) || double.IsInfinity(value)) {
            return Null();
        }
        RequireSafeMagnitude(value);

        BeforeValue();
#if NETCOREAPP3_0_OR_GREATER
        _builder.Append(value.ToString("R", CultureInfo.InvariantCulture));
#else
        // "R" does not always round-trip on .NET Framework; "G17" does, at the cost of longer output.
        _builder.Append(value.ToString("G17", CultureInfo.InvariantCulture));
#endif
        return this;
    }

    internal CanopyJsonWriter Number(decimal value) {
        RequireSafeMagnitude(value);
        BeforeValue();
        _builder.Append(value.ToString(CultureInfo.InvariantCulture));
        return this;
    }

    internal static void RequireSafeMagnitude(double value) {
        if (!double.IsNaN(value) && !double.IsInfinity(value) && Math.Abs(value) > 9007199254740991d) {
            throw new InvalidOperationException("Numeric values must be within JavaScript's safe integer range; use a text cell for larger exact values.");
        }
    }

    internal static void RequireSafeMagnitude(decimal value) {
        if (value < -9007199254740991m || value > 9007199254740991m) {
            throw new InvalidOperationException("Numeric values must be within JavaScript's safe integer range; use a text cell for larger exact values.");
        }
    }

    internal CanopyJsonWriter Boolean(bool value) {
        BeforeValue();
        _builder.Append(value ? "true" : "false");
        return this;
    }

    internal CanopyJsonWriter Null() {
        BeforeValue();
        _builder.Append("null");
        return this;
    }

    /// <summary>Writes a value that is already serialized JSON, such as a node the bundle writer measured before packing.</summary>
    internal CanopyJsonWriter Raw(string json) {
        BeforeValue();
        _builder.Append(json);
        return this;
    }

    internal CanopyJsonWriter Property(string name, string? value) => Name(name).String(value);

    internal CanopyJsonWriter Property(string name, long value) => Name(name).Number(value);

    internal CanopyJsonWriter Property(string name, bool value) => Name(name).Boolean(value);

    internal CanopyJsonWriter OptionalProperty(string name, string? value) => value == null ? this : Property(name, value);

    internal CanopyJsonWriter OptionalProperty(string name, int? value) => value.HasValue ? Property(name, value.Value) : this;

    internal CanopyJsonWriter StringArray(string name, IEnumerable<string> values) {
        Name(name).BeginArray();
        foreach (var value in values) {
            String(value);
        }

        return EndArray();
    }

    /// <summary>Writes the protocol envelope shared by every top-level document.</summary>
    internal CanopyJsonWriter Envelope(string type) => Property("protocol", CanopyProtocol.Version).Property("type", type);

    public override string ToString() => _builder.ToString();

    private void Push() {
        if (_depth == _hasItems.Length) {
            Array.Resize(ref _hasItems, _depth * 2);
        }

        _hasItems[_depth++] = false;
    }

    private void Pop() {
        if (_depth == 0) {
            throw new InvalidOperationException("Stack empty.");
        }

        _depth--;
    }

    private void BeforeValue() {
        if (_afterPropertyName) {
            _afterPropertyName = false;
            return;
        }

        if (_depth == 0) {
            if (_hasRoot) {
                throw new InvalidOperationException("A JSON document can hold only one root value.");
            }

            _hasRoot = true;
            return;
        }

        if (_hasItems[_depth - 1]) {
            _builder.Append(',');
        } else {
            _hasItems[_depth - 1] = true;
        }
    }

    /// <summary>
    /// Writes a JSON string. Runs of characters that need no escape are copied in one piece; a valid surrogate pair
    /// is copied as is and a lone surrogate is escaped, so the text survives UTF-8 encoding.
    /// </summary>
    private void AppendString(string value) {
        var builder = _builder;
        builder.Append('"');
        var start = 0;
        for (var index = 0; index < value.Length; index++) {
            var ch = value[index];
            if (ch < 128) {
                if (!EscapedAscii[ch] || (ch == '$' && (index + 1 >= value.Length || value[index + 1] != '{'))) {
                    continue;
                }
            } else if (char.IsSurrogate(ch)) {
                if (char.IsHighSurrogate(ch) && index + 1 < value.Length && char.IsLowSurrogate(value[index + 1])) {
                    index++;
                    continue;
                }
            } else if (ch != (char)0x2028 && ch != (char)0x2029) {
                continue;
            }

            if (index > start) {
                builder.Append(value, start, index - start);
            }

            AppendEscape(builder, ch);
            start = index + 1;
        }

        if (start < value.Length) {
            builder.Append(value, start, value.Length - start);
        }

        builder.Append('"');
    }

    private static void AppendEscape(StringBuilder builder, char ch) {
        switch (ch) {
            case '"':
                builder.Append("\\\"");
                break;
            case '\\':
                builder.Append("\\\\");
                break;
            case '\b':
                builder.Append("\\b");
                break;
            case '\f':
                builder.Append("\\f");
                break;
            case '\n':
                builder.Append("\\n");
                break;
            case '\r':
                builder.Append("\\r");
                break;
            case '\t':
                builder.Append("\\t");
                break;
            default:
                builder.Append('\\').Append('u').Append(Hex[(ch >> 12) & 0xF]).Append(Hex[(ch >> 8) & 0xF]).Append(Hex[(ch >> 4) & 0xF]).Append(Hex[ch & 0xF]);
                break;
        }
    }

    private static bool[] CreateEscapedAscii() {
        var escaped = new bool[128];
        for (var ch = 0; ch < ' '; ch++) {
            escaped[ch] = true;
        }

        foreach (var ch in "\"\\<>&`$") {
            escaped[ch] = true;
        }

        return escaped;
    }
}
