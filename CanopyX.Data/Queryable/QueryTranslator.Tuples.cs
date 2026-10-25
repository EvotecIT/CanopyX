using System;
using System.Linq.Expressions;

namespace CanopyX.Data;

internal sealed partial class QueryTranslator<T> {
    private Expression TuplePredicate(CanopyTupleFilter tuple) {
        Expression? any = null;
        foreach (var operands in tuple.Values) {
            Expression? all = null;
            for (var index = 0; index < tuple.Columns.Count; index++) {
                var column = tuple.Columns[index]; var bucket = tuple.Definition.Columns[index].Bucket;
                var value = bucket == null ? GroupValue(column.Id) : GroupValue(new CanopySummaryLevel(column, false, bucket: bucket));
                var operand = operands[index];
                Expression equal;
                if (operand == null) equal = ExpressionTools.IsNullable(value.Type) ? ExpressionTools.IsNull(value) : Expression.Constant(false);
                else if (bucket == null && (Map.Get(column.Id).Shape == ValueShape.Enum || Map.Get(column.Id).Shape == ValueShape.Boolean || column.Kind == CanopyColumnKind.DateTime))
                    equal = Condition(new CanopyFilterCondition(column, CanopyGridFilterOperator.Equal, new[] { operand }));
                else if (bucket == null && Map.Get(column.Id).Shape == ValueShape.Text && !(operand is string)) equal = Expression.Constant(false);
                else {
                    if (bucket == null && column.Kind == CanopyColumnKind.Number) value = Binary64(value);
                    equal = Expression.Equal(value, ExpressionTools.Parameter(operand, value.Type));
                    if (ExpressionTools.IsNullable(value.Type)) equal = Expression.AndAlso(ExpressionTools.NotNull(value), equal);
                }
                all = ExpressionTools.And(all, equal);
            }
            any = ExpressionTools.Or(any, all!);
        }
        return tuple.Definition.Exclude ? Expression.Not(any!) : any!;
    }
}
