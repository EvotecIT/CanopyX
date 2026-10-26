namespace CanopyX;

/// <summary>Operators supported by the flat-grid column filters.</summary>
public enum CanopyGridFilterOperator {
    /// <summary>Equals one typed operand.</summary>
    Equal = 0,
    /// <summary>Does not equal one typed operand; null values do not match.</summary>
    NotEqual,
    /// <summary>Contains one text operand, case-insensitively.</summary>
    Contains,
    /// <summary>Starts with one text operand, case-insensitively.</summary>
    StartsWith,
    /// <summary>Equals any of the supplied typed operands.</summary>
    In,
    /// <summary>Is greater than one number or UTC date operand.</summary>
    GreaterThan,
    /// <summary>Is greater than or equal to one number or UTC date operand.</summary>
    GreaterThanOrEqual,
    /// <summary>Is less than one number or UTC date operand.</summary>
    LessThan,
    /// <summary>Is less than or equal to one number or UTC date operand.</summary>
    LessThanOrEqual,
    /// <summary>Is missing or null. An empty string is a value.</summary>
    IsNull,
    /// <summary>Is neither missing nor null.</summary>
    IsNotNull,
    /// <summary>A named operator evaluated by a registered browser plugin or host source.</summary>
    Custom
}
