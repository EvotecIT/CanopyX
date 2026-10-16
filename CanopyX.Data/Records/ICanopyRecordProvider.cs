using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Loads one record's details for a record endpoint: the seam for back ends without a LINQ provider.</summary>
/// <remarks>
/// <para>
/// <see cref="CanopyQueryableRecordProvider{T}"/> implements it over any <c>IQueryable</c> and
/// <see cref="CanopyInMemoryRecordProvider{T}"/> is the reference implementation over records in memory. An implementation:
/// </para>
/// <list type="number">
/// <item>finds the record by its identity among the records the caller may read, with an indexed key lookup (never a scan of a
/// query result), and answers null when there is none, so a record outside the caller's scope answers exactly like a missing one;</item>
/// <item>for a whole record, answers the <see cref="CanopyRecordRequest.Fields"/> and <see cref="CanopyRecordRequest.Cells"/>
/// asked for and nothing else, each collection with at most <see cref="CanopyRecordRequest.FirstRows"/> rows in a stable order
/// (a unique key last) and its total, each timeline or change list with at most <see cref="CanopyRecordRequest.MaxItems"/>
/// items, and the record's row (as page rows are written) when <see cref="CanopyRecordRequest.Row"/> is set;</item>
/// <item>for a collection page, answers that field alone: the rows from <see cref="CanopyRecordRequest.Offset"/> (at most
/// <see cref="CanopyRecordRequest.Limit"/>) in the same order every time, and the collection's total;</item>
/// <item>reads collection rows only through the record it found, so child rows never bypass the caller's scope.</item>
/// </list>
/// <para>
/// The endpoint checks the revision before and after calling, sets the answer's revision, and checks the answer: it fails the request
/// rather than send a field or cell that was not asked for (including record fields carried on the returned parent row),
/// more rows than allowed, or a row of another record.
/// </para>
/// <para>
/// The endpoint also holds every answer to <see cref="CanopyRecordRequest.MaxTextLength"/>: text in fields, drawer values,
/// collection rows, list items, object fields, timelines and changes (values, display text, tooltips and badges) that is
/// longer is shortened, ellipsis included, to that many UTF-16 code units, never inside a surrogate pair. Identities, link
/// keys, trusted HTML markup and the record's row are never shortened. An implementation should still read long text only to the bound (one
/// character more tells longer text apart), since the answer is built in memory before the endpoint clips and measures it.
/// </para>
/// </remarks>
public interface ICanopyRecordProvider {
    /// <summary>Gets the record allow-list the provider serves.</summary>
    CanopyRecordSchema Schema { get; }

    /// <summary>Loads a record's details or a page of one of its collections.</summary>
    /// <param name="request">The validated request.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The details (without a revision; the endpoint sets it), or null when the caller has no such record.</returns>
    ValueTask<CanopyGridRecord?> GetRecordAsync(CanopyRecordRequest request, CancellationToken cancellationToken);
}
