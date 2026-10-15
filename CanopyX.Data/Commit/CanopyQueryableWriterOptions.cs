using System;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Options of <see cref="CanopyQueryableWriter{T}"/>.</summary>
/// <typeparam name="T">The record type.</typeparam>
public sealed class CanopyQueryableWriterOptions<T> where T : class {
    /// <summary>Gets or sets whether rows are written in a transaction each (default) or the batch in one, all or nothing.</summary>
    public CanopyCommitTransaction Transaction { get; set; }

    /// <summary>Gets or sets the dataset revision, read inside each transaction to decide whether a row's original values
    /// must match the stored ones, and after the commit for the result. Null uses the revision the endpoint read when the
    /// batch arrived, and lets the endpoint read the revision after the commit from its data provider.</summary>
    /// <remarks>Use the same revision as the read side (<see cref="CanopyQueryOptions.Revision"/>), and change it in
    /// <see cref="Saving"/> so every write produces a new revision.</remarks>
    public Func<CancellationToken, ValueTask<string>>? Revision { get; set; }

    /// <summary>Gets or sets whether rows are compared with their original values only when the batch revision differs from
    /// the current one (default), or always. Comparing always also catches writes that did not change the revision.</summary>
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
