using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyQueryableProvider<T> {
    /// <inheritdoc />
    /// <remarks>
    /// The range becomes one predicate over the mapped expressions: the query's search, predicates and filter group exactly as
    /// pages apply them, the resource restriction as an <c>in</c> predicate, and the overlap as half-open millisecond bounds on the
    /// start, end and series-end values with null and empty tests on the recurrence value. It composes on the base query, so the
    /// caller's scope still applies; every instant and resource identity is a query parameter. A count and one window ordered by
    /// the start column and the record key follow. Database ordering by the start column requires its <c>SortBy</c> mapping, as
    /// date sorting does.
    /// </remarks>
    public async ValueTask<CanopyRangeResult> RangeAsync(CanopyRangeRequest request, CancellationToken cancellationToken) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        var selection = request.Selection;
        var source = _source();
        var translator = Translator(source);
        translator.ValidateOrder(selection.Sort);
        var filtered = translator.Apply(source, selection);
        var matched = await Executor.CountAsync(filtered, cancellationToken).ConfigureAwait(false);
        var take = Math.Min(request.Limit, matched);
        if (take == 0) return new CanopyRangeResult(matched, Array.Empty<CanopyGridRow>());
        var columns = Map.Columns.Select(column => column.Id).ToList();
        var rows = await RowsAsync(translator, translator.Order(filtered, selection.Sort).Take(take), columns, cancellationToken).ConfigureAwait(false);
        return new CanopyRangeResult(matched, rows);
    }
}
