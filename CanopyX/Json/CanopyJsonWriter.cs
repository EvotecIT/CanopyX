using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace CanopyX.Json;

/// <summary>
/// Minimal forward-only JSON writer used for every <c>canopyx/2</c> document.
/// </summary>
/// <remarks>
/// <para>
/// CanopyX targets <c>net472</c> and <c>netstandard2.0</c> without runtime package dependencies, so it cannot use
/// <c>System.Text.Json</c>. The writer is deterministic (invariant culture, no whitespace) and HTML-safe: it escapes
/// <c>&lt;</c>, <c>&gt;</c>, <c>&amp;</c>, U+2028 and U+2029 so the output can be embedded in a
/// <c>&lt;script&gt;</c> element or a sidecar script without further encoding. It also escapes the backtick and a
/// <c>$</c> before <c>{</c>, so a document can sit inside a JavaScript template literal unchanged (bundle packs).
/// </para>
/// <para>
/// A writer either collects the document as text (<see cref="ToString()"/>), passes it on to a
/// <see cref="TextWriter"/> in pieces (<see cref="Streaming"/>), so a large document is never held whole, or
/// writes nothing at all (<see cref="Discarding"/>), which runs every check of a document's writer without building
/// its text. All three produce, or would produce, the same characters.
/// </para>
/// </remarks>
internal sealed class CanopyJsonWriter {
    /// <summary>The text collected before a streaming writer passes it on.</summary>
    private const int StreamChunk = 16 * 1024;

    private static readonly char[] Hex = "0123456789abcdef".ToCharArray();

    /// <summary>The ASCII characters <see cref="AppendString"/> escapes; <c>$</c> only before <c>{</c>.</summary>
    private static readonly bool[] EscapedAscii = CreateEscapedAscii();

    private readonly StringBuilder? _builder;
    private readonly TextWriter? _sink;
    /// <summary>Whether each open array or object, innermost last, holds an item yet.</summary>
    private bool[] _hasItems = new bool[16];
    private int _depth;
    private bool _afterPropertyName;
    private bool _hasRoot;
#if !NETCOREAPP3_0_OR_GREATER
    /// <summary>The buffer a streaming writer copies its text through on frameworks without span writes.</summary>
    private char[]? _copy;
#endif

    internal CanopyJsonWriter(int capacity = 256) {
        _builder = new StringBuilder(capacity);
    }

    private CanopyJsonWriter(StringBuilder? builder, TextWriter? sink) {
        _builder = builder;
        _sink = sink;
    }

    /// <summary>
    /// A writer that passes its text to <paramref name="sink"/> in pieces of about 16K characters. Call
    /// <see cref="Complete"/> after the last value.
    /// </summary>
    internal static CanopyJsonWriter Streaming(TextWriter sink) => new CanopyJsonWriter(new StringBuilder(StreamChunk + 1024), sink ?? throw new ArgumentNullException(nameof(sink)));

    /// <summary>A writer that checks what it is given and writes nothing, for validation that needs no text.</summary>
    internal static CanopyJsonWriter Discarding() => new CanopyJsonWriter(null, null);

    internal int Length => _builder?.Length ?? 0;

    /// <summary>Gets whether the writer writes nothing (<see cref="Discarding"/>), so a caller can skip formatting text no check needs.</summary>
    internal bool IsDiscarding => _builder == null;

    internal CanopyJsonWriter BeginObject() {
        BeforeValue();
        _builder?.Append('{');
        Push();
        return this;
    }

    internal CanopyJsonWriter EndObject() {
        Pop();
        _builder?.Append('}');
        PassOn();
        return this;
    }

    internal CanopyJsonWriter BeginArray() {
        BeforeValue();
        _builder?.Append('[');
        Push();
        return this;
    }

    internal CanopyJsonWriter EndArray() {
        Pop();
        _builder?.Append(']');
        PassOn();
        return this;
    }

    internal CanopyJsonWriter Name(string name) {
        if (_depth == 0) {
            throw new InvalidOperationException("A property name must be written inside an object.");
        }

        if (_hasItems[_depth - 1]) {
            _builder?.Append(',');
        } else {
            _hasItems[_depth - 1] = true;
        }

        AppendString(name);
        _builder?.Append(':');
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
        if (_builder != null) {
#if NETCOREAPP3_0_OR_GREATER
            Span<char> digits = stackalloc char[20];
            value.TryFormat(digits, out var written, default, CultureInfo.InvariantCulture);
            _builder.Append(digits.Slice(0, written));
#else
            _builder.Append(value.ToString(CultureInfo.InvariantCulture));
#endif
        }

        return this;
    }

    internal CanopyJsonWriter Number(double value) {
        if (double.IsNaN(value) || double.IsInfinity(value)) {
            return Null();
        }
        RequireSafeMagnitude(value);

        BeforeValue();
#if NETCOREAPP3_0_OR_GREATER
        _builder?.Append(value.ToString("R", CultureInfo.InvariantCulture));
#else
        // "R" does not always round-trip on .NET Framework; "G17" does, at the cost of longer output.
        _builder?.Append(value.ToString("G17", CultureInfo.InvariantCulture));
#endif
        return this;
    }

    internal CanopyJsonWriter Number(decimal value) {
        RequireSafeMagnitude(value);
        BeforeValue();
        _builder?.Append(value.ToString(CultureInfo.InvariantCulture));
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
        _builder?.Append(value ? "true" : "false");
        return this;
    }

    internal CanopyJsonWriter Null() {
        BeforeValue();
        _builder?.Append("null");
        return this;
    }

    /// <summary>Writes a value that is already serialized JSON, such as a node the bundle writer measured before packing.</summary>
    internal CanopyJsonWriter Raw(string json) {
        BeforeValue();
        _builder?.Append(json);
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

    /// <summary>Passes the text a streaming writer still holds on to its sink.</summary>
    internal void Complete() {
        if (_sink != null && _builder!.Length > 0) {
            Flush();
        }
    }

    public override string ToString() => _builder?.ToString() ?? string.Empty;

    /// <summary>Returns part of the text written so far, without the rest.</summary>
    internal string ToString(int start, int length) => _builder?.ToString(start, length) ?? string.Empty;

    /// <summary>
    /// Empties a writer that collects text so it can write the next document, keeping its buffer: a writer that
    /// serializes many small documents one after another then allocates only their strings.
    /// </summary>
    internal CanopyJsonWriter Reset() {
        _builder?.Clear();
        _depth = 0;
        _afterPropertyName = false;
        _hasRoot = false;
        return this;
    }

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
            _builder?.Append(',');
        } else {
            _hasItems[_depth - 1] = true;
        }
    }

    /// <summary>Hands a streaming writer's text to its sink once a piece is full; called where a value ends.</summary>
    private void PassOn() {
        if (_sink != null && _builder!.Length >= StreamChunk) {
            Flush();
        }
    }

    private void Flush() {
#if NETCOREAPP3_0_OR_GREATER
        _sink!.Write(_builder!);
#else
        var builder = _builder!;
        _copy ??= new char[StreamChunk + 1024];
        for (var start = 0; start < builder.Length; start += _copy.Length) {
            var count = Math.Min(_copy.Length, builder.Length - start);
            builder.CopyTo(start, _copy, 0, count);
            _sink!.Write(_copy, 0, count);
        }
#endif
        _builder!.Clear();
    }

    /// <summary>
    /// Writes a JSON string. Runs of characters that need no escape are copied in one piece; a valid surrogate pair
    /// is copied as is and a lone surrogate is escaped, so the text survives UTF-8 encoding.
    /// </summary>
    private void AppendString(string value) {
        var builder = _builder;
        if (builder == null) {
            return;
        }

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
