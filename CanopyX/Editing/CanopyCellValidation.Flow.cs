using System;
using System.Text.RegularExpressions;

namespace CanopyX;

// The checks of a flow field (CanopyFlowField.Validation): the same settings as a grid column's, fitted to the field kinds.
public sealed partial class CanopyCellValidation {
    /// <summary>Checks that the settings fit a flow field of <paramref name="kind"/>: ranges for number and date-and-time fields,
    /// lengths and a pattern for text, text area and secret fields, and limits within their bounds.</summary>
    internal void Validate(CanopyFlowFieldKind kind, string field) {
        if (kind != CanopyFlowFieldKind.Number && (Minimum.HasValue || Maximum.HasValue)) throw new InvalidOperationException("Field " + field + ": Minimum and Maximum check number fields.");
        if (kind != CanopyFlowFieldKind.DateTime && (Earliest.HasValue || Latest.HasValue)) throw new InvalidOperationException("Field " + field + ": Earliest and Latest check date-and-time fields.");
        var text = kind == CanopyFlowFieldKind.Text || kind == CanopyFlowFieldKind.TextArea || kind == CanopyFlowFieldKind.Secret;
        if (!text && (MinLength.HasValue || MaxLength.HasValue || Pattern != null)) throw new InvalidOperationException("Field " + field + ": lengths and patterns check text, text area and secret fields.");
        foreach (var bound in new[] { Minimum, Maximum }) {
            if (bound.HasValue && (double.IsNaN(bound.Value) || double.IsInfinity(bound.Value) || Math.Abs(bound.Value) > 9007199254740991d))
                throw new InvalidOperationException("Field " + field + ": validation limits must be finite and within the safe integer magnitude.");
        }

        if (Minimum > Maximum || Earliest > Latest || MinLength > MaxLength) throw new InvalidOperationException("Field " + field + ": a lower limit cannot exceed its upper limit.");
        if (Message != null && (!CanopyFlowValues.HasVisibleText(Message) || Message.Length > 1024)) throw new InvalidOperationException("Field " + field + ": a validation message needs visible text of at most 1024 characters.");
        if (Pattern != null) CheckWholePattern(Pattern, "Field " + field + " has an invalid pattern.");
    }

    /// <summary>Checks a pattern the browser anchors at both ends: the shared bounded grammar, compiled alone and anchored.</summary>
    internal static void CheckWholePattern(string pattern, string message) {
        CanopyPattern.Validate(pattern, whole: true);
        // The pattern must compile on its own too, so a stray parenthesis cannot escape the anchors the browser adds.
        try {
            _ = new Regex(pattern, RegexOptions.ECMAScript, TimeSpan.FromSeconds(1));
            _ = new Regex("^(?:" + pattern + ")$", RegexOptions.ECMAScript, TimeSpan.FromSeconds(1));
        } catch (ArgumentException error) {
            throw new InvalidOperationException(message, error);
        }
    }
}
