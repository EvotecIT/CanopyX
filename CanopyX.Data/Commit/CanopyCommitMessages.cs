using System;
using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>The messages a commit answers with when a value fails the server's checks or a row cannot be saved.</summary>
/// <remarks>
/// The defaults are English and match the browser's editing messages. Placeholders: <c>{column}</c> (the column title),
/// <c>{min}</c>, <c>{max}</c> and <c>{step}</c>. A column's <see cref="CanopyCellValidation.Message"/> replaces every check
/// message of that column. Replace these per endpoint (<see cref="CanopyRemoteOptions.CommitMessages"/>) to translate them.
/// </remarks>
public sealed class CanopyCommitMessages {
    /// <summary>Gets or sets the message for an empty required value.</summary>
    public string Required { get; set; } = "{column} is required.";

    /// <summary>Gets or sets the message for a value that is not a number.</summary>
    public string Number { get; set; } = "{column} must be a number.";

    /// <summary>Gets or sets the message for a fractional or out-of-range value of a whole-number field.</summary>
    public string WholeNumber { get; set; } = "{column} must be a whole number in range.";

    /// <summary>Gets or sets the message for a value that is not a date and time with a time zone.</summary>
    public string Date { get; set; } = "{column} must be a valid date.";

    /// <summary>Gets or sets the message for text where a true or false value belongs, or the reverse.</summary>
    public string Type { get; set; } = "{column} has a value of the wrong type.";

    /// <summary>Gets or sets the message for a value below the minimum.</summary>
    public string Minimum { get; set; } = "{column} must be at least {min}.";

    /// <summary>Gets or sets the message for a value above the maximum.</summary>
    public string Maximum { get; set; } = "{column} must be at most {max}.";

    /// <summary>Gets or sets the message for a number that is not a multiple of the editor's step.</summary>
    public string Step { get; set; } = "{column} must be a multiple of {step}.";

    /// <summary>Gets or sets the message for text shorter than its minimum length.</summary>
    public string MinimumLength { get; set; } = "{column} needs at least {min} characters.";

    /// <summary>Gets or sets the message for text longer than its maximum length.</summary>
    public string MaximumLength { get; set; } = "{column} allows at most {max} characters.";

    /// <summary>Gets or sets the message for text that does not match the column's pattern.</summary>
    public string Pattern { get; set; } = "{column} does not have the expected format.";

    /// <summary>Gets or sets the message for a value outside a select editor's choices or an enumeration's members.</summary>
    public string Choice { get; set; } = "Choose {column} from the list.";

    /// <summary>Gets or sets the message for a row whose stored record changed since the reader loaded it.</summary>
    public string Conflict { get; set; } = "Someone else changed this row. Reload it and try again.";

    /// <summary>Gets or sets the message for a row whose record no longer exists.</summary>
    public string Missing { get; set; } = "This record no longer exists.";

    /// <summary>Gets or sets the message for a row the store refused, without its internal reason.</summary>
    public string NotSaved { get; set; } = "The row could not be saved.";

    /// <summary>Gets or sets the message for a new row when the writer does not add records.</summary>
    public string InsertRefused { get; set; } = "New rows cannot be added here.";

    /// <summary>Gets or sets the message for a row that was valid but not saved because another row of an all-or-nothing batch failed.</summary>
    public string BatchNotSaved { get; set; } = "Not saved: another row of this batch could not be saved.";

    internal static string Fill(string template, CanopyDataColumn column, IDictionary<string, string>? values = null) {
        var text = (template ?? string.Empty).Replace("{column}", column.Title);
        if (values != null) foreach (var pair in values) text = text.Replace("{" + pair.Key + "}", pair.Value);
        return text.Length > 1024 ? text.Substring(0, 1024) : text;
    }
}
