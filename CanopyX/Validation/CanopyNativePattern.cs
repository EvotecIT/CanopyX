using System.Text.RegularExpressions;

namespace CanopyX;

/// <summary>A bounded native pattern plus the browser's applicable input casing mode.</summary>
internal sealed class CanopyNativePattern {
    private readonly Regex _pattern;
    private readonly bool _exact;
    private readonly bool _wildcard;

    internal CanopyNativePattern(Regex pattern, bool exact, bool wildcard = false) {
        _pattern = pattern; _exact = exact; _wildcard = wildcard;
    }

    internal bool IsMatch(string text) => _pattern.IsMatch(_exact ? text : _wildcard ? CanopyPattern.LowerNativeInput(text) : CanopyPattern.FoldNativeInput(text));
}
