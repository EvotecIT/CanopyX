using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyQueryableProvider<T> {
    private async ValueTask<CanopyFacetResult> BucketFacetAsync(QueryTranslator<T> translator, IQueryable<T> source, CanopyFacetRequest request, int matched, CancellationToken cancellationToken) {
        var items = new List<CanopyFacetBucket>();
        var total = 0;
        var needle = CanopyTextFolding.Fold(request.Search)!;
        // Grouping and counts run in the store. Stream only grouped keys; retain at most the requested prefix.
        await foreach (var item in translator.BucketValuesAsync(source, request, Executor, cancellationToken).ConfigureAwait(false)) {
            var value = (double?)item.Value;
            if (needle.Length > 0 && (!value.HasValue || !CanopyTextFolding.Fold(request.Bucket!.Label(value.Value))!.Contains(needle))) continue;
            total++;
            if (items.Count < request.Limit) items.Add(new CanopyFacetBucket(value, item.Count));
        }
        return new CanopyFacetResult(matched, total, items);
    }
}
