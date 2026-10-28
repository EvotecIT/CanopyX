using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Counts all row identities in a complete two-version comparison, before any display filtering.</summary>
public sealed class CanopyDatasetCompareCounts {
    /// <summary>Creates nonnegative, mutually exclusive row counts.</summary>
    /// <param name="added">Rows only in the later version.</param>
    /// <param name="removed">Rows only in the earlier version.</param>
    /// <param name="changed">Matched rows with changed cells.</param>
    /// <param name="unchanged">Matched rows without changed cells.</param>
    public CanopyDatasetCompareCounts(int added, int removed, int changed, int unchanged) {
        if (added < 0) throw new ArgumentOutOfRangeException(nameof(added));
        if (removed < 0) throw new ArgumentOutOfRangeException(nameof(removed));
        if (changed < 0) throw new ArgumentOutOfRangeException(nameof(changed));
        if (unchanged < 0) throw new ArgumentOutOfRangeException(nameof(unchanged));
        Added = added; Removed = removed; Changed = changed; Unchanged = unchanged;
    }

    /// <summary>Gets the number of added rows.</summary>
    public int Added { get; }
    /// <summary>Gets the number of removed rows.</summary>
    public int Removed { get; }
    /// <summary>Gets the number of changed matched rows.</summary>
    public int Changed { get; }
    /// <summary>Gets the number of unchanged matched rows.</summary>
    public int Unchanged { get; }
    /// <summary>Gets the number of distinct row identities across both versions.</summary>
    public long Total => (long)Added + Removed + Changed + Unchanged;

    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject()
        .Property("added", Added).Property("removed", Removed).Property("changed", Changed)
        .Property("unchanged", Unchanged).EndObject();
}
