using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CanopyX.Json;

/// <summary>
/// A small, strict and bounded JSON reader for documents CanopyX reads back, such as the flow contract.
/// </summary>
/// <remarks>
/// CanopyX targets <c>net472</c> and <c>netstandard2.0</c> without runtime package dependencies, so it cannot use
/// <c>System.Text.Json</c>. The reader follows RFC 8259 strictly: objects become <see cref="Dictionary{TKey,TValue}"/> of
/// string keys (a repeated key is an error), arrays <see cref="List{T}"/>, strings <see cref="string"/>, integral numbers
/// that fit <see cref="long"/> become <see cref="long"/> and other numbers <see cref="double"/>, and the literals
/// <see cref="bool"/> or null. It rejects comments, trailing commas, lone surrogates, control characters in strings,
/// numbers outside the finite double range, nesting deeper than <see cref="MaxDepth"/>, input longer than
/// <see cref="MaxLength"/> characters, and anything after the root value.
/// </remarks>
internal sealed class CanopyJsonReader {
    /// <summary>The deepest nesting of arrays and objects the reader accepts.</summary>
    internal const int MaxDepth = 64;

    /// <summary>The longest input the reader accepts, in UTF-16 code units (4 MiB).</summary>
    internal const int MaxLength = 4 * 1024 * 1024;

    private readonly string _json;
    private int _position;
    private int _depth;

    private CanopyJsonReader(string json) {
        _json = json;
    }

    /// <summary>Reads one JSON document.</summary>
    /// <param name="json">The text.</param>
    /// <returns>The root value.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="json"/> is null.</exception>
    /// <exception cref="FormatException">The text is not one valid JSON value within the reader's bounds.</exception>
    internal static object? Parse(string json) {
        if (json == null) throw new ArgumentNullException(nameof(json));
        if (json.Length > MaxLength) throw new FormatException("A JSON document holds at most " + MaxLength.ToString(CultureInfo.InvariantCulture) + " characters.");
        var reader = new CanopyJsonReader(json);
        reader.SkipWhitespace();
        var value = reader.ReadValue();
        reader.SkipWhitespace();
        if (reader._position != json.Length) throw reader.Error("Unexpected data after the JSON value");
        return value;
    }

    private object? ReadValue() {
        if (_position >= _json.Length) throw Error("Unexpected end of the JSON text");
        var ch = _json[_position];
        switch (ch) {
            case '{': return ReadObject();
            case '[': return ReadArray();
            case '"': return ReadString();
            case 't': ReadLiteral("true"); return true;
            case 'f': ReadLiteral("false"); return false;
            case 'n': ReadLiteral("null"); return null;
            default:
                if (ch == '-' || ch >= '0' && ch <= '9') return ReadNumber();
                throw Error("Unexpected character");
        }
    }

    private Dictionary<string, object?> ReadObject() {
        Enter();
        _position++;
        var map = new Dictionary<string, object?>(StringComparer.Ordinal);
        SkipWhitespace();
        if (Peek() == '}') {
            _position++;
            _depth--;
            return map;
        }

        while (true) {
            SkipWhitespace();
            if (Peek() != '"') throw Error("Expected a property name");
            var name = ReadString();
            SkipWhitespace();
            Expect(':');
            SkipWhitespace();
            var value = ReadValue();
            if (map.ContainsKey(name)) throw Error("Duplicate property '" + name + "'");
            map.Add(name, value);
            SkipWhitespace();
            if (Peek() == ',') {
                _position++;
                continue;
            }

            Expect('}');
            _depth--;
            return map;
        }
    }

    private List<object?> ReadArray() {
        Enter();
        _position++;
        var list = new List<object?>();
        SkipWhitespace();
        if (Peek() == ']') {
            _position++;
            _depth--;
            return list;
        }

        while (true) {
            SkipWhitespace();
            list.Add(ReadValue());
            SkipWhitespace();
            if (Peek() == ',') {
                _position++;
                continue;
            }

            Expect(']');
            _depth--;
            return list;
        }
    }

    private string ReadString() {
        _position++;
        var start = _position;
        StringBuilder? builder = null;
        while (true) {
            if (_position >= _json.Length) throw Error("Unterminated string");
            var ch = _json[_position];
            if (ch == '"') {
                var text = builder == null ? _json.Substring(start, _position - start) : builder.Append(_json, start, _position - start).ToString();
                _position++;
                return text;
            }

            if (ch < ' ') throw Error("Control character in a string");
            if (char.IsSurrogate(ch)) {
                if (!char.IsHighSurrogate(ch) || _position + 1 >= _json.Length || !char.IsLowSurrogate(_json[_position + 1])) throw Error("Lone surrogate in a string");
                _position += 2;
                continue;
            }

            if (ch != '\\') {
                _position++;
                continue;
            }

            builder ??= new StringBuilder();
            builder.Append(_json, start, _position - start);
            _position++;
            if (_position >= _json.Length) throw Error("Unterminated escape");
            var escape = _json[_position++];
            switch (escape) {
                case '"': builder.Append('"'); break;
                case '\\': builder.Append('\\'); break;
                case '/': builder.Append('/'); break;
                case 'b': builder.Append('\b'); break;
                case 'f': builder.Append('\f'); break;
                case 'n': builder.Append('\n'); break;
                case 'r': builder.Append('\r'); break;
                case 't': builder.Append('\t'); break;
                case 'u': {
                    var unit = ReadHex();
                    if (char.IsHighSurrogate(unit)) {
                        if (_position + 1 >= _json.Length || _json[_position] != '\\' || _json[_position + 1] != 'u') throw Error("Lone surrogate escape");
                        _position += 2;
                        var low = ReadHex();
                        if (!char.IsLowSurrogate(low)) throw Error("Lone surrogate escape");
                        builder.Append(unit).Append(low);
                    } else if (char.IsLowSurrogate(unit)) {
                        throw Error("Lone surrogate escape");
                    } else {
                        builder.Append(unit);
                    }

                    break;
                }
                default:
                    throw Error("Invalid escape");
            }

            start = _position;
        }
    }

    private char ReadHex() {
        if (_position + 4 > _json.Length) throw Error("Invalid unicode escape");
        var value = 0;
        for (var index = 0; index < 4; index++) {
            var ch = _json[_position++];
            var digit = ch >= '0' && ch <= '9' ? ch - '0' : ch >= 'a' && ch <= 'f' ? ch - 'a' + 10 : ch >= 'A' && ch <= 'F' ? ch - 'A' + 10 : -1;
            if (digit < 0) throw Error("Invalid unicode escape");
            value = value * 16 + digit;
        }

        return (char)value;
    }

    private object ReadNumber() {
        var start = _position;
        if (Peek() == '-') _position++;
        if (Peek() == '0') {
            _position++;
        } else if (Peek() >= '1' && Peek() <= '9') {
            while (Peek() >= '0' && Peek() <= '9') _position++;
        } else {
            throw Error("Invalid number");
        }

        var integral = true;
        if (Peek() == '.') {
            integral = false;
            _position++;
            if (!(Peek() >= '0' && Peek() <= '9')) throw Error("Invalid number");
            while (Peek() >= '0' && Peek() <= '9') _position++;
        }

        if (Peek() == 'e' || Peek() == 'E') {
            integral = false;
            _position++;
            if (Peek() == '+' || Peek() == '-') _position++;
            if (!(Peek() >= '0' && Peek() <= '9')) throw Error("Invalid number");
            while (Peek() >= '0' && Peek() <= '9') _position++;
        }

        var text = _json.Substring(start, _position - start);
        if (integral && long.TryParse(text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var whole)) return whole;
        if (!double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var real) || double.IsNaN(real) || double.IsInfinity(real)) throw Error("Number out of range");
        return real;
    }

    private void ReadLiteral(string literal) {
        if (string.CompareOrdinal(_json, _position, literal, 0, literal.Length) != 0) throw Error("Unexpected character");
        _position += literal.Length;
    }

    private void Enter() {
        if (++_depth > MaxDepth) throw Error("JSON nesting is deeper than " + MaxDepth.ToString(CultureInfo.InvariantCulture) + " levels");
    }

    private void SkipWhitespace() {
        while (_position < _json.Length) {
            var ch = _json[_position];
            if (ch != ' ' && ch != '\t' && ch != '\n' && ch != '\r') return;
            _position++;
        }
    }

    private char Peek() => _position < _json.Length ? _json[_position] : '\0';

    private void Expect(char expected) {
        if (Peek() != expected) throw Error("Expected '" + expected + "'");
        _position++;
    }

    private FormatException Error(string message) => new FormatException(message + " at position " + _position.ToString(CultureInfo.InvariantCulture) + ".");
}
