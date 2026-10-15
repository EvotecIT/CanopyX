using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>A field read through the record's child rows: a collection, a timeline or a change list.</summary>
internal abstract class RecordChildMap<T> : RecordFieldMap<T> {
    protected RecordChildMap(string id) : base(id) { }

    /// <summary>Whether the field is a collection whose rows page.</summary>
    internal abstract bool Collection { get; }

    /// <summary>The page size of a collection, or the item limit of a timeline or change list.</summary>
    internal abstract int Size { get; }

    /// <summary>Reads the child rows of the one record <paramref name="scoped"/> holds: a window of them (and for collections the
    /// total). A whole-record answer gets null for no rows; a page always gets its (possibly empty) rows. A collection says
    /// <paramref name="pageSize"/> rows per Load more, its page size within the endpoint's limit.</summary>
    internal abstract Task<CanopyCell?> QueryAsync(IQueryable<T> scoped, RecordReadContext<T> context, int offset, int take, int pageSize, bool page, CancellationToken cancellationToken);

    /// <summary>The same rows evaluated in memory over one record, for the reference provider.</summary>
    internal abstract CanopyCell? Evaluate(T record, RecordReadContext<T> context, int offset, int take, int pageSize, bool page);
}
