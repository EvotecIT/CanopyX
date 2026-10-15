using System.Collections.Generic;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>A value read with the record itself, in its one projection: a scalar, a link or a column's drawer value.</summary>
internal abstract class RecordValueMap<T> : RecordFieldMap<T> {
    protected RecordValueMap(string id) : base(id) { }

    /// <summary>The expressions the record's projection reads for this value, in order.</summary>
    internal abstract IReadOnlyList<LambdaExpression> Parts { get; }

    /// <summary>The cell from the projected values of <see cref="Parts"/>, starting at <paramref name="start"/>; null for an empty value.</summary>
    internal abstract CanopyCell? Build(IReadOnlyList<object?> values, int start);

    /// <summary>Whether a part is text the answer bounds (<see cref="CanopyRemoteLimits.MaxRecordTextLength"/>); keys are not.</summary>
    internal virtual bool IsText(int part) => true;

    /// <summary>A key that must belong to a record of the caller's scoped query for the value to show, or null.</summary>
    internal virtual LambdaExpression? ScopeTarget => null;
}
