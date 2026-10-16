using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Options of <see cref="CanopyQueryableWriter{T}"/>.</summary>
/// <typeparam name="T">The record type.</typeparam>
public sealed class CanopyQueryableWriterOptions<T> where T : class {
    /// <summary>Gets or sets the records this caller may read, usually the endpoint's query callback (<c>() =&gt; query(http)</c>).
    /// A row whose key is not in it answers as a missing record and is not written. Null checks nothing: the writer then
    /// writes any record <see cref="ICanopyWriteStore{T}.Records"/> holds.</summary>
    /// <remarks>Set it whenever callers may read only some records, so a caller cannot change a record it cannot see.</remarks>
    public Func<IQueryable<T>>? Scope { get; set; }

    /// <summary>
    /// Gets or sets how a new record of an insert row is created, before the row's values are applied: set the fields the caller
    /// owns or must not choose (tenant, owner, audit fields) here. Null (the default) refuses inserts with
    /// <see cref="CanopyCommitMessages.InsertRefused"/>; the store must also implement <see cref="ICanopyInsertStore{T}"/>.
    /// </summary>
    /// <remarks>An insert writes only editable columns, as an update does, and never the key: the store assigns it, or this
    /// callback does. With <see cref="Scope"/> set, a new record that is not in the scope after saving is rolled back and answers
    /// as not saved, so a caller cannot add a record it could not read; the scope must then query the same unit of work as the
    /// store, which sees the unsaved record inside the transaction.</remarks>
    public Func<CanopyCommitRow, T>? NewRecord { get; set; }

    /// <summary>Gets or sets whether rows are written in a transaction each (default) or the batch in one, all or nothing.</summary>
    public CanopyCommitTransaction Transaction { get; set; }

    /// <summary>Gets or sets the dataset revision, read inside each transaction: while it equals the batch's revision the
    /// row's original values are not compared. It is also read after the commit for the result. Null compares the original
    /// values of every row, and lets the endpoint read the revision after the commit from its data provider.</summary>
    /// <remarks>Use the same revision as the read side (<see cref="CanopyQueryOptions.Revision"/>), and change it in
    /// <see cref="Saving"/> so every write produces a new revision.</remarks>
    public Func<CancellationToken, ValueTask<string>>? Revision { get; set; }

    /// <summary>Gets or sets whether rows are compared with their original values even while a configured
    /// <see cref="Revision"/> equals the batch's. Comparing always also catches writes that did not change the revision.</summary>
    /// <remarks>The comparison protects against lost updates only when the store's transaction serializes the load, the
    /// comparison and the save (serializable or snapshot isolation, or row locks); a concurrency token on the record makes
    /// the store itself refuse a save over a newer version, which answers a conflict.</remarks>
    public bool AlwaysCompareOriginals { get; set; }

    /// <summary>Gets or sets a step that runs after a row's values are applied and before it is saved, inside its transaction:
    /// stamp an audit column, change the dataset revision, or refuse the row by returning a message (null accepts it).</summary>
    public Func<CanopyWriteContext<T>, CancellationToken, ValueTask<string?>>? Saving { get; set; }

    /// <summary>Gets or sets a callback for an exception that stopped a row, for logging. The row answers with a generic message
    /// (<see cref="CanopyCommitMessages.NotSaved"/>), or a conflict for a store concurrency failure; the exception text never
    /// reaches the client.</summary>
    public Action<CanopyCommitRow, Exception>? Failed { get; set; }

    /// <summary>Gets or sets the messages of conflicts, missing records and refused rows. Null uses the defaults.</summary>
    public CanopyCommitMessages? Messages { get; set; }

    /// <summary>Gets or sets how records are loaded. Default <see cref="CanopyQueryExecutor.Default"/>.</summary>
    public CanopyQueryExecutor Executor { get; set; } = CanopyQueryExecutor.Default;
}
