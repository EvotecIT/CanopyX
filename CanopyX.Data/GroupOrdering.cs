using System;
using System.Collections.Generic;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace CanopyX.Data;

/// <summary>The protocol's order of sibling groups and the identities of groups at every level, shared by the handler and the providers.</summary>
internal static class GroupOrdering {
    private static readonly CanopyCell Missing = new CanopyCell();

    /// <summary>
    /// Compares two groups of one level: by raw value in the level's direction (missing last), or for a level with an
    /// aggregate by that aggregate in the level's direction, missing aggregates last and equal values by raw value ascending.
    /// </summary>
    internal static Comparison<TGroup> Create<TGroup>(CanopyDataSchema schema, CanopySummaryLevel level, Func<TGroup, object?> value, Func<TGroup, double?> aggregate) {
        var byValue = schema.GroupComparer(level.Column.Id, level.Descending);
        if (level.Aggregate == null) return (left, right) => byValue.Compare(Cell(value(left)), Cell(value(right)));
        var ascending = schema.GroupComparer(level.Column.Id, false);
        return (left, right) => {
            var x = aggregate(left);
            var y = aggregate(right);
            if (!x.HasValue || !y.HasValue) return x.HasValue == y.HasValue ? ascending.Compare(Cell(value(left)), Cell(value(right))) : x.HasValue ? -1 : 1;
            var compared = level.Descending ? y.Value.CompareTo(x.Value) : x.Value.CompareTo(y.Value);
            return compared != 0 ? compared : ascending.Compare(Cell(value(left)), Cell(value(right)));
        };
    }

    private static CanopyCell Cell(object? value) => CanopyDataValues.ToCell(value) ?? Missing;

    /// <summary>
    /// A group identity unique across every level of a summary. Groups of the first level keep the single-level form
    /// (<see cref="CanopyRemoteHandler.GroupKey"/>, for example <c>s:North</c>). An inner group's key is its depth, a colon and
    /// the level keys of its path joined by <c>/</c> with <c>\</c> and <c>/</c> escaped, for example <c>2:s:North/s:Open</c>;
    /// a key longer than the protocol allows becomes the depth, <c>#</c> and a digest of that text. First-level keys never
    /// start with a digit, and the depth and the escaping keep every level and every path apart.
    /// </summary>
    internal static string Key(IReadOnlyList<string> path) {
        if (path.Count == 1) return path[0];
        var builder = new StringBuilder();
        builder.Append(path.Count.ToString(CultureInfo.InvariantCulture)).Append(':');
        for (var i = 0; i < path.Count; i++) {
            if (i > 0) builder.Append('/');
            foreach (var unit in path[i]) {
                if (unit == '\\' || unit == '/') builder.Append('\\');
                builder.Append(unit);
            }
        }
        if (builder.Length <= 4096) return builder.ToString();
        using var sha = SHA256.Create();
        var bytes = sha.ComputeHash(Encoding.Unicode.GetBytes(builder.ToString()));
        var digest = new StringBuilder(path.Count.ToString(CultureInfo.InvariantCulture)).Append('#');
        foreach (var b in bytes) digest.Append(b.ToString("x2", CultureInfo.InvariantCulture));
        return digest.ToString();
    }
}
