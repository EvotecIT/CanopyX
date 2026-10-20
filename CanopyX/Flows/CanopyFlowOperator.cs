namespace CanopyX;

/// <summary>The test of a flow condition predicate (<see cref="CanopyFlowCondition.Operator"/>), as the filter builder names it.</summary>
public enum CanopyFlowOperator {
    /// <summary>Equal to one value (<c>eq</c>). Text compares without case.</summary>
    Equal,

    /// <summary>Not equal to one value (<c>ne</c>).</summary>
    NotEqual,

    /// <summary>Greater than one value (<c>gt</c>).</summary>
    GreaterThan,

    /// <summary>Greater than or equal to one value (<c>ge</c>).</summary>
    GreaterOrEqual,

    /// <summary>Less than one value (<c>lt</c>).</summary>
    LessThan,

    /// <summary>Less than or equal to one value (<c>le</c>).</summary>
    LessOrEqual,

    /// <summary>Text containing one value, or an array holding it (<c>contains</c>).</summary>
    Contains,

    /// <summary>The negation of <see cref="Contains"/> (<c>notContains</c>).</summary>
    NotContains,

    /// <summary>Text starting with one value (<c>startsWith</c>).</summary>
    StartsWith,

    /// <summary>Text ending with one value (<c>endsWith</c>).</summary>
    EndsWith,

    /// <summary>Text matching one bounded pattern (<c>matches</c>).</summary>
    Matches,

    /// <summary>The negation of <see cref="Matches"/> (<c>notMatches</c>).</summary>
    NotMatches,

    /// <summary>Equal to one of 1 to 1,000 values, or an array holding any of them (<c>in</c>).</summary>
    In,

    /// <summary>The negation of <see cref="In"/> (<c>notIn</c>).</summary>
    NotIn,

    /// <summary>Between two values, both included, lower first (<c>between</c>).</summary>
    Between,

    /// <summary>Empty: no value, an empty string or an array without items (<c>isNull</c>).</summary>
    IsEmpty,

    /// <summary>The negation of <see cref="IsEmpty"/> (<c>isNotNull</c>).</summary>
    IsNotEmpty
}