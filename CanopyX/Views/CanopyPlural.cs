using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace CanopyX;

/// <summary>
/// Plural texts as the browser reads them (<c>[one]{count} file[other]{count} files</c>), for the static renderers: the form for a
/// count follows the plural rules of the output culture's language for whole numbers, and "other" when a language has no form of
/// its own. The rules cover English and the languages CanopyX translates; any other language takes "one" for 1 and "other" for the rest.
/// </summary>
internal static class CanopyPlural {
    private static readonly Regex Form = new Regex(@"\[(zero|one|two|few|many|other)\]([^\[]*)", RegexOptions.CultureInvariant);

    /// <summary>Whether a text is plain, or a complete list of plural forms ending with an other form, each holding <paramref name="placeholder"/>.</summary>
    internal static bool IsValid(string text, string placeholder) {
        if (!text.StartsWith("[", StringComparison.Ordinal)) return text.IndexOf(placeholder, StringComparison.Ordinal) >= 0;
        var length = 0;
        var other = false;
        foreach (Match match in Form.Matches(text)) {
            length += match.Length;
            other |= match.Groups[1].Value == "other";
            if (match.Groups[2].Value.IndexOf(placeholder, StringComparison.Ordinal) < 0) return false;
        }

        return other && length == text.Length;
    }

    /// <summary>The form of a plural text for a count, or the text itself when it has no forms.</summary>
    internal static string Pick(string text, long count, CultureInfo culture) {
        if (!text.StartsWith("[", StringComparison.Ordinal)) return text;
        var forms = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (Match match in Form.Matches(text)) forms[match.Groups[1].Value] = match.Groups[2].Value;
        return forms.TryGetValue(Category(count, culture), out var form) ? form : forms.TryGetValue("other", out var fallback) ? fallback : text;
    }

    /// <summary>The CLDR cardinal category of a whole number in a culture's language.</summary>
    private static string Category(long count, CultureInfo culture) {
        var n = Math.Abs(count);
        var tens = n % 10;
        var hundreds = n % 100;
        switch (culture.TwoLetterISOLanguageName) {
            case "pl":
                if (n == 1) return "one";
                return tens >= 2 && tens <= 4 && (hundreds < 12 || hundreds > 14) ? "few" : "many";
            case "cs":
            case "sk":
                return n == 1 ? "one" : n >= 2 && n <= 4 ? "few" : "other";
            case "fr":
                return n <= 1 ? "one" : n % 1000000 == 0 ? "many" : "other";
            case "es":
            case "it":
                // Whole millions take the many form, as Intl.PluralRules does since CLDR 42.
                return n == 1 ? "one" : n != 0 && n % 1000000 == 0 ? "many" : "other";
            default:
                return n == 1 ? "one" : "other";
        }
    }
}
