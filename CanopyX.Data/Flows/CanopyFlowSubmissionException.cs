using System;
using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>
/// A proposal whose answers fail the flow's checks on the server: required answers, ranges, lengths, patterns, counts, item
/// rules, options and secrets. <see cref="FieldErrors"/> holds the messages by field, and <see cref="ToAnswer"/> turns them into
/// the error answer the browser shows beside the fields. A malformed proposal throws <see cref="CanopyRequestException"/> instead.
/// </summary>
public sealed class CanopyFlowSubmissionException : Exception {
    /// <summary>Creates the exception.</summary>
    /// <param name="fieldErrors">The messages by field id.</param>
    public CanopyFlowSubmissionException(IReadOnlyDictionary<string, string> fieldErrors) : base("The answers do not pass the flow's checks.") {
        FieldErrors = fieldErrors ?? throw new ArgumentNullException(nameof(fieldErrors));
    }

    /// <summary>Gets the messages by field id.</summary>
    public IReadOnlyDictionary<string, string> FieldErrors { get; }

    /// <summary>The error answer that shows the messages beside their fields.</summary>
    /// <param name="message">The review page's message, or null for the translated default.</param>
    /// <returns>The answer.</returns>
    public CanopyFlowAnswer ToAnswer(string? message = null) {
        var answer = CanopyFlowAnswer.Error(message);
        foreach (var entry in FieldErrors) answer.FieldErrors[entry.Key] = entry.Value;
        return answer;
    }
}