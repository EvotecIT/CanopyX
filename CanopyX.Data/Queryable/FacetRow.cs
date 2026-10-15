namespace CanopyX.Data;

/// <summary>One value-list bucket as a LINQ provider materializes it: the grouping key, a representative value and the count.</summary>
internal sealed class FacetRow<TKey, TValue> {
    public TKey Key { get; set; } = default!;
    public TValue Value { get; set; } = default!;
    public int Count { get; set; }
}
