namespace CanopyX;

/// <summary>
/// Operators of a formatting condition: every flat-grid filter operator, plus negations, suffixes, patterns, ranges and
/// relative dates. Missing values match only <see cref="IsNull"/>, as in filters.
/// </summary>
public enum CanopyFormatOperator {
    /// <summary>Equals one typed operand (<c>eq</c>).</summary>
    Equal = 0,
    /// <summary>Does not equal one typed operand (<c>ne</c>).</summary>
    NotEqual,
    /// <summary>Is greater than one operand (<c>gt</c>).</summary>
    GreaterThan,
    /// <summary>Is greater than or equal to one operand (<c>ge</c>).</summary>
    GreaterThanOrEqual,
    /// <summary>Is less than one operand (<c>lt</c>).</summary>
    LessThan,
    /// <summary>Is less than or equal to one operand (<c>le</c>).</summary>
    LessThanOrEqual,
    /// <summary>Contains one text operand (<c>contains</c>).</summary>
    Contains,
    /// <summary>Does not contain one text operand (<c>notContains</c>).</summary>
    NotContains,
    /// <summary>Starts with one text operand (<c>startsWith</c>).</summary>
    StartsWith,
    /// <summary>Ends with one text operand (<c>endsWith</c>).</summary>
    EndsWith,
    /// <summary>Matches a wildcard pattern, where <c>*</c> is any text and <c>?</c> one character (<c>like</c>).</summary>
    Like,
    /// <summary>Does not match a wildcard pattern (<c>notLike</c>).</summary>
    NotLike,
    /// <summary>Matches a regular expression of at most 256 characters (<c>matches</c>).</summary>
    /// <remarks>Use the syntax common to ECMAScript and .NET expressions: the browser and the static renderer both evaluate it.</remarks>
    Matches,
    /// <summary>Does not match a regular expression (<c>notMatches</c>).</summary>
    NotMatches,
    /// <summary>Equals any of 1 to 1,000 operands (<c>in</c>).</summary>
    In,
    /// <summary>Equals none of 1 to 1,000 operands (<c>notIn</c>).</summary>
    NotIn,
    /// <summary>Lies between two operands, both included (<c>between</c>).</summary>
    Between,
    /// <summary>Lies strictly between two operands (<c>betweenExclusive</c>).</summary>
    BetweenExclusive,
    /// <summary>Is missing or null (<c>isNull</c>).</summary>
    IsNull,
    /// <summary>Is present (<c>isNotNull</c>).</summary>
    IsNotNull,
    /// <summary>Is a date earlier than a number of days ago (<c>olderThan</c>).</summary>
    OlderThanDays,
    /// <summary>Is a date within the last number of days, up to now (<c>withinLast</c>).</summary>
    WithinLastDays
}
