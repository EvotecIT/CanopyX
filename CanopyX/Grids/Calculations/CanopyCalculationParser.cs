using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CanopyX;

/// <summary>Recursive descent parsing with independent recursion and actual AST-depth bounds.</summary>
internal sealed class CanopyCalculationParser {
    private readonly string _source;
    private int _at;
    private int _nodes;
    private int _nesting;
    internal readonly List<string> Dependencies = new List<string>();

    internal CanopyCalculationParser(string source) { _source = source; }

    internal CanopyCalculationNode Parse() {
        var result = Comparison();
        Space();
        if (_at != _source.Length) throw Invalid();
        return result;
    }

    private CanopyCalculationNode Node(string operation, object? value, params CanopyCalculationNode[] children) {
        var depth = 1;
        foreach (var child in children) depth = Math.Max(depth, child.Depth + 1);
        if (++_nodes > 256 || depth > 32) throw Invalid();
        return new CanopyCalculationNode(operation, value, children, depth);
    }

    private CanopyCalculationNode Comparison() {
        var left = Sum();
        string? operation;
        while ((operation = Operator("==", "!=", "<>", "<=", ">=", "=", "<", ">")) != null) left = Node(operation, null, left, Sum());
        return left;
    }

    private CanopyCalculationNode Sum() {
        var left = Product();
        string? operation;
        while ((operation = Operator("+", "-")) != null) left = Node(operation, null, left, Product());
        return left;
    }

    private CanopyCalculationNode Product() {
        var left = Unary();
        string? operation;
        while ((operation = Operator("*", "/", "%")) != null) left = Node(operation, null, left, Unary());
        return left;
    }

    private CanopyCalculationNode Unary() {
        if (++_nesting > 32) throw Invalid();
        try {
            var operation = Operator("+", "-");
            return operation == null ? Primary() : Node("u" + operation, null, Unary());
        } finally { _nesting--; }
    }

    private CanopyCalculationNode Primary() {
        Space();
        if (Take('(')) {
            var inner = Comparison();
            Require(')');
            return inner;
        }
        if (_at == _source.Length) throw Invalid();
        var first = _source[_at];
        if (first == '"') return Node("literal", ReadString());
        if (Take('[')) {
            var start = _at;
            while (_at < _source.Length && _source[_at] != ']') _at++;
            var id = _source.Substring(start, _at - start);
            Require(']');
            CanopyIdentifiers.Require(id, "expression");
            if (!Dependencies.Contains(id)) Dependencies.Add(id);
            if (Dependencies.Count > 64) throw Invalid();
            return Node("reference", id);
        }
        if (Digit(first)) return Node("literal", ReadNumber());
        var wordStart = _at;
        while (_at < _source.Length && ((_source[_at] >= 'A' && _source[_at] <= 'Z') ||
            (_source[_at] >= 'a' && _source[_at] <= 'z'))) _at++;
        if (wordStart == _at) throw Invalid();
        var word = _source.Substring(wordStart, _at - wordStart).ToUpperInvariant();
        switch (word) {
            case "TRUE": return Node("literal", true);
            case "FALSE": return Node("literal", false);
            case "NULL": return Node("literal", null);
        }
        Require('(');
        var arguments = new List<CanopyCalculationNode>();
        if (!Take(')')) {
            do {
                if (arguments.Count == 32) throw Invalid();
                arguments.Add(Comparison());
            } while (Take(','));
            Require(')');
        }
        var count = arguments.Count;
        if (!(word == "IF" && count == 3 || word == "ROUND" && count == 2 || word == "DATEPART" && count == 2 ||
            word == "DATEDIFF" && count == 3 || (word == "COALESCE" || word == "CONCAT") && count >= 1)) throw Invalid();
        return Node(word, null, arguments.ToArray());
    }

    private double ReadNumber() {
        var start = _at;
        if (_source[_at++] != '0') while (_at < _source.Length && Digit(_source[_at])) _at++;
        if (_at < _source.Length && _source[_at] == '.') { _at++; Digits(); }
        if (_at < _source.Length && (_source[_at] == 'e' || _source[_at] == 'E')) {
            _at++;
            if (_at < _source.Length && (_source[_at] == '+' || _source[_at] == '-')) _at++;
            Digits();
        }
        if (!CanopyCalculationNumberParser.TryParse(_source.Substring(start, _at - start), out var value)) throw Invalid();
        return value;
    }

    private void Digits() {
        var start = _at;
        while (_at < _source.Length && Digit(_source[_at])) _at++;
        if (_at == start) throw Invalid();
    }

    private string ReadString() {
        _at++;
        var text = new StringBuilder();
        while (_at < _source.Length) {
            var ch = _source[_at++];
            if (ch == '"') return text.ToString();
            if (ch < 32) throw Invalid();
            if (ch == '\\') {
                if (_at == _source.Length) throw Invalid();
                ch = _source[_at++];
                switch (ch) {
                    case '"': case '\\': case '/': break;
                    case 'b': ch = '\b'; break;
                    case 'f': ch = '\f'; break;
                    case 'n': ch = '\n'; break;
                    case 'r': ch = '\r'; break;
                    case 't': ch = '\t'; break;
                    case 'u':
                        if (_at + 4 > _source.Length || !ushort.TryParse(_source.Substring(_at, 4), NumberStyles.AllowHexSpecifier,
                            CultureInfo.InvariantCulture, out var code)) throw Invalid();
                        ch = (char)code; _at += 4; break;
                    default: throw Invalid();
                }
            }
            text.Append(ch);
        }
        throw Invalid();
    }

    private string? Operator(params string[] choices) {
        Space();
        foreach (var choice in choices) {
            if (_at + choice.Length <= _source.Length && string.CompareOrdinal(_source, _at, choice, 0, choice.Length) == 0) {
                _at += choice.Length;
                return choice;
            }
        }
        return null;
    }

    private bool Take(char ch) {
        Space();
        if (_at == _source.Length || _source[_at] != ch) return false;
        _at++; return true;
    }

    private void Require(char ch) { if (!Take(ch)) throw Invalid(); }
    private void Space() {
        const string spaces = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
        while (_at < _source.Length && spaces.IndexOf(_source[_at]) >= 0) _at++;
    }
    private static bool Digit(char ch) => ch >= '0' && ch <= '9';
    private ArgumentException Invalid() => new ArgumentException("Invalid calculation syntax or limit at position " + _at + ".", "expression");
}
