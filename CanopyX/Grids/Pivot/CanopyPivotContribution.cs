using System.Collections.Generic;

namespace CanopyX;

// Store-side GROUP BY contributions retain weights and distinct keys, never raw hosted records.
internal sealed class CanopyPivotContribution {
    internal object?[] Rows { get; set; } = System.Array.Empty<object?>();
    internal object?[] Columns { get; set; } = System.Array.Empty<object?>();
    internal int Count { get; set; }
    internal double?[] Values { get; set; } = System.Array.Empty<double?>();
    internal int[] Counts { get; set; } = System.Array.Empty<int>();
    internal object?[] Distinct { get; set; } = System.Array.Empty<object?>();
}
