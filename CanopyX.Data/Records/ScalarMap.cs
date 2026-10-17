using System;
using System.Collections.Generic;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>A scalar value: text, a boolean, an enumeration, a number or a date, converted as column values are.</summary>
internal sealed class ScalarMap<T> : RecordValueMap<T> {
    private readonly LambdaExpression[] _parts;
    private readonly Func<object?, CanopyCell?>? _format;

    internal ScalarMap(string id, LambdaExpression value, Func<object?, CanopyCell?>? format) : base(id) {
        _parts = new[] { value };
        _format = format;
    }

    internal override IReadOnlyList<LambdaExpression> Parts => _parts;

    internal override CanopyCell? Build(IReadOnlyList<object?> values, int start) =>
        _format != null ? _format(values[start]) : CanopyDataValues.ToCell(values[start]);
}
