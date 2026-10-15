using CanopyX.Bundles;

namespace CanopyX;

/// <summary>The protocol's canonical case folding, shared by search, text predicates and value-list buckets.</summary>
/// <remarks>
/// Folding maps single UTF-16 code units with fixed cross-runtime rules and the frozen lowercase table that the browser
/// runtime also uses, independent of the host's culture and Unicode version (see "Search" in docs/data-protocol.md).
/// Host query engines use it when they evaluate case-insensitive text matching in memory.
/// </remarks>
public static class CanopyTextFolding {
    /// <summary>Folds one UTF-16 code unit.</summary>
    /// <param name="unit">The code unit.</param>
    /// <returns>The folded code unit; units without a single-unit lowercase mapping are returned unchanged.</returns>
    public static char Fold(char unit) => CanopySearchFolding.Fold(unit);

    /// <summary>Folds text code unit by code unit. The result has the same length as the input.</summary>
    /// <param name="text">The text, or null.</param>
    /// <returns>The folded text, or null when <paramref name="text"/> is null.</returns>
    public static string? Fold(string? text) {
        if (text == null) return null;
        char[]? units = null;
        for (var i = 0; i < text.Length; i++) {
            var folded = CanopySearchFolding.Fold(text[i]);
            if (folded == text[i]) continue;
            units ??= text.ToCharArray();
            units[i] = folded;
        }
        return units == null ? text : new string(units);
    }
}
