using System;

namespace CanopyX;

/// <summary>A case-insensitive quick-search pattern using the same bounded grammar as conditions and editing.
/// Groups, alternatives and backreferences are unsupported; at most one variable repetition is allowed and it must start at <c>^</c>.</summary>
public sealed class CanopyGridRegexSearch {
    private readonly CanopyNativePattern _pattern;

    /// <summary>The maximum pattern length, in UTF-16 code units.</summary>
    public const int MaximumPatternLength = 256;

    /// <summary>The maximum searchable cell input length, in UTF-16 code units. Longer inputs never match, and are never truncated.</summary>
    public const int MaximumInputLength = 4096;

    /// <summary>Compiles a bounded pattern. Native evaluation additionally has a 100 ms match timeout.</summary>
    /// <param name="pattern">The reader's pattern, at most 256 UTF-16 code units.</param>
    /// <exception cref="ArgumentNullException">The pattern is null.</exception>
    /// <exception cref="InvalidOperationException">The pattern is outside the bounded grammar.</exception>
    /// <exception cref="ArgumentException">The pattern is syntactically invalid.</exception>
    public CanopyGridRegexSearch(string pattern) {
        if (pattern == null) throw new ArgumentNullException(nameof(pattern));
        _pattern = new CanopyNativePattern(CanopyPattern.CompileNative(pattern, exact: false), exact: false);
    }

    /// <summary>Tests a non-null raw/search-text cell value without accent folding. Empty input is permitted.</summary>
    /// <param name="text">The searchable cell input.</param>
    /// <returns>Whether the pattern matches any part of the input; false for input longer than <see cref="MaximumInputLength"/>.</returns>
    /// <exception cref="ArgumentNullException">The input is null.</exception>
    /// <exception cref="System.Text.RegularExpressions.RegexMatchTimeoutException">The native 100 ms match limit is exceeded.</exception>
    public bool IsMatch(string text) {
        if (text == null) throw new ArgumentNullException(nameof(text));
        // One long cell (a description or a log line) must not make the whole search fail; it simply does not match.
        if (text.Length > MaximumInputLength) return false;
        return _pattern.IsMatch(text);
    }
}
