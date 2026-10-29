using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Text templates for the column slots of a card layout. A <c>{columnId}</c> token inserts a formatted cell value;
/// all other text is literal. Templates never contain executable markup.</summary>
public sealed class CanopyCardTemplate {
    /// <summary>Gets templates keyed by the column slot they replace. Unspecified slots keep their ordinary presenter.
    /// Slots retain column order, selection controls and keyboard navigation. At most 64 templates of 2,048 characters are allowed.</summary>
    public IDictionary<string, string> Slots { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    internal void Validate(IList<CanopyColumn> columns) {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in columns) ids.Add(column.Id);
        if (Slots.Count == 0 || Slots.Count > 64) throw new InvalidOperationException("A card template needs between 1 and 64 column slots.");
        foreach (var slot in Slots) {
            if (!ids.Contains(slot.Key) || slot.Value == null || slot.Value.Length > 2048)
                throw new InvalidOperationException("Card slots must name declared columns and contain at most 2,048 characters.");
            var literal = Regex.Replace(slot.Value, @"\{([^{}]+)\}", match => {
                if (!ids.Contains(match.Groups[1].Value)) throw new InvalidOperationException("Card template tokens must name declared columns.");
                return string.Empty;
            });
            if (literal.IndexOfAny(new[] { '{', '}' }) >= 0) throw new InvalidOperationException("Card template braces must enclose a column identity.");
        }
    }

    internal static string Format(string template, Func<string, string> value) => Regex.Replace(template, @"\{([^{}]+)\}", match => value(match.Groups[1].Value));

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        foreach (var slot in Slots) writer.Property(slot.Key, slot.Value);
        writer.EndObject();
    }
}
