using System;
using System.Linq.Expressions;
using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>A column mapping without its generic value type.</summary>
internal sealed class MappedColumn {
    internal MappedColumn(string id, LambdaExpression value, ValueShape shape) {
        Id = id;
        Value = value;
        Shape = shape;
    }

    internal string Id { get; }
    internal LambdaExpression Value { get; }
    internal ValueShape Shape { get; }
    internal LambdaExpression? SortBy { get; set; }
    internal LambdaExpression? SearchBy { get; set; }
    internal Func<object?, CanopyCell?>? Format { get; set; }
    internal bool Filterable { get; set; } = true;
    internal bool NeverNull { get; set; }
    internal Dictionary<string, LambdaExpression> BucketTimes { get; } = new Dictionary<string, LambdaExpression>(StringComparer.Ordinal);
}
