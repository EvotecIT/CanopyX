namespace CanopyX;

/// <summary>How the predicates and child groups in a flat-grid filter group combine.</summary>
public enum CanopyGridFilterJunction {
    /// <summary>Every predicate and child group must match.</summary>
    All = 0,
    /// <summary>At least one predicate or child group must match.</summary>
    Any
}
