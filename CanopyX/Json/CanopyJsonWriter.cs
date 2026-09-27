using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CanopyX.Json;

/// <summary>
/// Minimal forward-only JSON writer used for every <c>canopyx/1</c> document.
/// </summary>
/// <remarks>
/// CanopyX targets <c>net472</c> and <c>netstandard2.0</c> without runtime package dependencies, so it cannot use
/// <c>System.Text.Json</c>. The writer is deterministic (invariant culture, no whitespace) and HTML-safe: it escapes
/// <c>&lt;</c>, <c>&gt;</c>, <c>&amp;</c>, U+2028 and U+2029 so the output can be embedded in a
/// <c>&lt;script&gt;</c> element or a sidecar script without further encoding.
/// </remarks>
internal sealed class CanopyJsonWriter {
    private readonly StringBuilder _builder;
    private readonly Stack<bool> _hasItems = new Stack<bool>();
    private bool _afterPropertyName;

    internal CanopyJsonWriter(int capacity = 256) {
        _builder = new StringBuilder(capacity);
    }

    internal int Length => _builder.Length;

    internal CanopyJsonWriter BeginObject() {
        BeforeValue();
        _builder.Append('{');
        _hasItems.Push(false);
        return this;
    }

    internal CanopyJsonWriter EndObject() {
        _hasItems.Pop();
        _builder.Append('}');
        return this;
    }

    internal CanopyJsonWriter BeginArray() {
        BeforeValue();
        _builder.Append('[');
        _hasItems.Push(false);
        return this;
    }

    internal CanopyJsonWriter EndArray() {
        _hasItems.Pop();
        _builder.Append(']');
        return this;
    }

    internal CanopyJsonWriter Name(string name) {
        if (_hasItems.Count == 0) {
            throw new InvalidOperationException("A property name must be written inside an object.");
        }

        if (_hasItems.Peek()) {
            _builder.Append(',');
        } else {
            _hasItems.Pop();
            _hasItems.Push(true);
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
        BeforeValue();
        _builder.Append(value.ToString(CultureInfo.InvariantCulture));
        return this;
    }

    internal CanopyJsonWriter Number(double value) {
        if (double.IsNaN(value) || double.IsInfinity(value)) {
            return Null();
        }

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
        BeforeValue();
        _builder.Append(value.ToString(CultureInfo.InvariantCulture));
        return this;
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

    private void BeforeValue() {
        if (_afterPropertyName) {
            _afterPropertyName = false;
            return;
        }

        if (_hasItems.Count == 0) {
            if (_builder.Length > 0) {
                throw new InvalidOperationException("A JSON document can hold only one root value.");
            }

            return;
        }

        if (_hasItems.Peek()) {
            _builder.Append(',');
        } else {
            _hasItems.Pop();
            _hasItems.Push(true);
        }
    }

    private void AppendString(string value) {
        _builder.Append('"');
        for (var index = 0; index < value.Length; index++) {
            var ch = value[index];
            if (char.IsSurrogate(ch)) {
                // A valid pair is copied as is; a lone surrogate is escaped so it survives UTF-8 encoding.
                if (char.IsHighSurrogate(ch) && index + 1 < value.Length && char.IsLowSurrogate(value[index + 1])) {
                    _builder.Append(ch).Append(value[index + 1]);
                    index++;
                } else {
                    AppendUnicodeEscape(ch);
                }

                continue;
            }

            switch (ch) {
                case '"':
                    _builder.Append("\\\"");
                    break;
                case '\\':
                    _builder.Append("\\\\");
                    break;
                case '\b':
                    _builder.Append("\\b");
                    break;
                case '\f':
                    _builder.Append("\\f");
                    break;
                case '\n':
                    _builder.Append("\\n");
                    break;
                case '\r':
                    _builder.Append("\\r");
                    break;
                case '\t':
                    _builder.Append("\\t");
                    break;
                case '<':
                case '>':
                case '&':
                case (char)0x2028:
                case (char)0x2029:
                    AppendUnicodeEscape(ch);
                    break;
                default:
                    if (ch < ' ') {
                        AppendUnicodeEscape(ch);
                    } else {
                        _builder.Append(ch);
                    }

                    break;
            }
        }

        _builder.Append('"');
    }

    private void AppendUnicodeEscape(char ch) {
        _builder.Append("\\u").Append(((int)ch).ToString("x4", CultureInfo.InvariantCulture));
    }
}
