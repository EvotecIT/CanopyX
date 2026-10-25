using System;
using System.Linq.Expressions;
using System.Collections.Generic;
using System.Linq;
using System.Threading;

namespace CanopyX.Data;

internal sealed partial class QueryTranslator<T> {
    internal IAsyncEnumerable<StoreBucket> BucketValuesAsync(IQueryable<T> source, CanopyFacetRequest request, CanopyQueryExecutor executor, CancellationToken cancellationToken) =>
        OrderedValueBucketsCoreAsync<double?>(source, GroupValue(new CanopySummaryLevel(request.Column, false, bucket: request.Bucket)), executor, cancellationToken);
    internal Expression GroupValue(CanopySummaryLevel level) {
        var value = GroupValue(level.Column.Id);
        if (level.Bucket == null) return value;
        var bucket = level.Bucket;
        if (_memory) {
            var method = typeof(CanopyBucket).GetMethod(nameof(CanopyBucket.Key))!;
            return Expression.Call(Expression.Constant(bucket), method, Expression.Convert(value, typeof(object)));
        }
        if (bucket.Kind < CanopyBucketKind.Width && bucket.TimeZone != "UTC") {
            if (!Map.Get(level.Column.Id).BucketTimes.TryGetValue(bucket.TimeZone, out var clock))
                throw new CanopyRequestException(CanopyRequestError.Unsupported, "A non-UTC database bucket needs a BucketTimeZone mapping for '" + bucket.TimeZone + "'.");
            value = ExpressionTools.Bind(clock, Row, false);
        }
        return CanopyBucketExpressions.Key(value, bucket);
    }
}
