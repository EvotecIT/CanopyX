namespace CanopyX.Data;

/// <summary>
/// A write store that also adds new records, which lets <see cref="CanopyQueryableWriter{T}"/> save inserts (a calendar's created
/// or dropped events, for example) when <see cref="CanopyQueryableWriterOptions{T}.NewRecord"/> is set too.
/// </summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>For EF Core: <c>public void Add(T record) =&gt; db.Set&lt;T&gt;().Add(record);</c> (see docs/remote-dotnet.md).</remarks>
public interface ICanopyInsertStore<T> : ICanopyWriteStore<T> where T : class {
    /// <summary>Tracks a new record, so the next save inserts it; the store assigns its key if it generates keys.</summary>
    /// <param name="record">The new record, with its values applied.</param>
    void Add(T record);
}
