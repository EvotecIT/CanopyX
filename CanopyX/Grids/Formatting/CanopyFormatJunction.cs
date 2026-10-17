namespace CanopyX;

/// <summary>How the predicates and child groups of a formatting condition combine.</summary>
public enum CanopyFormatJunction {
    /// <summary>Every predicate and child group must match (<c>and</c>).</summary>
    All = 0,
    /// <summary>At least one predicate or child group must match (<c>or</c>).</summary>
    Any,
    /// <summary>No predicate or child group may match (<c>none</c>).</summary>
    None
}
