namespace CanopyX;

/// <summary>Whether row identities are durable keys or positions within one materialized dataset snapshot.</summary>
public enum CanopyGridRowIdentity {
    /// <summary>Rows have host-declared stable keys that can be replayed in another report or used by live updates.</summary>
    StableKey,

    /// <summary>Rows use zero-based source positions. Sorting and filtering retain these positions; selections cannot be saved or replayed.</summary>
    Ordinal
}
