using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>The reference <see cref="ICanopyDataWriter"/>: saves commits through a column map to a store such as EF Core.</summary>
/// <typeparam name="T">The record type.</typeparam>
/// <remarks>
/// <para>
/// It writes only columns the view declares editable and the map maps to a member of the record itself (<c>x =&gt; x.Cores</c>);
/// creating it fails when an editable column maps a navigation chain, the record key, or a member marked as a concurrency
/// token. For each row it checks that the record lies in <see cref="CanopyQueryableWriterOptions{T}.Scope"/> (the records
/// this caller may read), loads it by the map's key, compares the original values with the stored ones (a difference is a
/// conflict and nothing is written), converts and applies the new values, runs
/// <see cref="CanopyQueryableWriterOptions{T}.Saving"/> and saves, in a transaction per row or one for the batch.
/// </para>
/// <para>
/// <b>Concurrency.</b> Originals are compared on every row unless a revision source is configured
/// (<see cref="CanopyQueryableWriterOptions{T}.Revision"/>) and still equals the batch's revision inside the row's
/// transaction. The comparison is only as strong as the transaction: the store must serialize the load, compare and save
/// (a serializable or snapshot isolation level, or row locks), or another writer can change the record between the load
/// and the save. Give the record a concurrency token (EF Core <c>IsRowVersion</c> or <c>IsConcurrencyToken</c>): the store
/// then refuses such a save, and the row answers a conflict.
/// </para>
/// <para>
/// <b>Inserts.</b> A row with <see cref="CanopyCommitOperation.Insert"/> is saved only when
/// <see cref="CanopyQueryableWriterOptions{T}.NewRecord"/> is set and the store implements <see cref="ICanopyInsertStore{T}"/>;
/// otherwise it answers <see cref="CanopyCommitMessages.InsertRefused"/>. The new record gets the editable values of the row
/// (never the key), runs <see cref="CanopyQueryableWriterOptions{T}.Saving"/>, is added and saved, and answers its stored key
/// as <see cref="CanopyCommitRowResult.NewId"/>. A new record outside the store's query or the optional scope is rolled back.
/// </para>
/// <para>
/// A saved row answers with canonical cells of its changed columns, read back from the record and formatted like page rows.
/// An exception stops its row only: the row answers with a generic message, or a conflict when the store reports a
/// concurrency failure (an exception type named <c>DbUpdateConcurrencyException</c>, as EF Core raises for concurrency tokens).
/// </para>
/// </remarks>
public sealed class CanopyQueryableWriter<T> : ICanopyInsertWriter where T : class {
    /// <inheritdoc />
    public CanopyCommitTransaction Transaction => _options.Transaction;

    /// <summary>Gets whether inserts are saved: <see cref="CanopyQueryableWriterOptions{T}.NewRecord"/> is set and the store implements <see cref="ICanopyInsertStore{T}"/>.</summary>
    public bool AcceptsInserts => _options.NewRecord != null && _store is ICanopyInsertStore<T>;
    private readonly CanopyColumnMap<T> _map;
    private readonly ICanopyWriteStore<T> _store;
    private readonly CanopyQueryableWriterOptions<T> _options;
    private readonly Dictionary<string, MemberWriter<T>> _members = new Dictionary<string, MemberWriter<T>>(StringComparer.Ordinal);
    private readonly ParameterExpression _row = Expression.Parameter(typeof(T), "row");
    private readonly Expression _key;
    private readonly Func<T, object?> _readKey;

    /// <summary>Creates a writer.</summary>
    /// <param name="map">The column allow-list; its editable columns must map members of the record.</param>
    /// <param name="store">The unit of work of this request.</param>
    /// <param name="options">Scope, transactions, revision, hooks and messages; null uses the defaults.</param>
    /// <exception cref="ArgumentException">An editable mapped column cannot be written, or maps the key or a concurrency token.</exception>
    public CanopyQueryableWriter(CanopyColumnMap<T> map, ICanopyWriteStore<T> store, CanopyQueryableWriterOptions<T>? options = null) {
        _map = map ?? throw new ArgumentNullException(nameof(map));
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _options = options ?? new CanopyQueryableWriterOptions<T>();
        var keyMember = Member(map.KeyExpression!);
        foreach (var column in map.Schema.EditableColumns) {
            var writer = MemberWriter<T>.Create(map.Get(column.Id).Value, out var reason)
                ?? throw new ArgumentException("Column '" + column.Id + "' is editable but cannot be written: " + reason + ". Map it to a member of " + typeof(T).Name + ", or make it read-only.", nameof(map));
            if (keyMember != null && writer.Member.Name == keyMember.Name && writer.Member.DeclaringType == keyMember.DeclaringType)
                throw new ArgumentException("Column '" + column.Id + "' maps the record key, which a commit cannot change; make it read-only.", nameof(map));
            if (writer.Member.GetCustomAttributes(true).Any(attribute => attribute.GetType().Name is "ConcurrencyCheckAttribute" or "TimestampAttribute"))
                throw new ArgumentException("Column '" + column.Id + "' maps a concurrency token, which only the store changes; make it read-only.", nameof(map));
            _members[column.Id] = writer;
        }
        _key = new Rebinder(map.KeyExpression!.Parameters[0], _row).Visit(map.KeyExpression.Body)!;
        _readKey = Expression.Lambda<Func<T, object?>>(Expression.Convert(_key, typeof(object)), _row).Compile();
    }

    private CanopyCommitMessages Messages => _options.Messages ?? DefaultMessages;

    private static readonly CanopyCommitMessages DefaultMessages = new CanopyCommitMessages();

    /// <inheritdoc />
    public async ValueTask<CanopyCommitResult> CommitAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) {
        if (batch == null) throw new ArgumentNullException(nameof(batch));
        if (!ReferenceEquals(batch.Schema, _map.Schema)) throw new ArgumentException("The batch belongs to another schema.", nameof(batch));
        var results = _options.Transaction == CanopyCommitTransaction.PerBatch
            ? await BatchAsync(batch, revision, cancellationToken).ConfigureAwait(false)
            : await RowsAsync(batch, revision, cancellationToken).ConfigureAwait(false);
        string? after = null;
        if (_options.Revision != null) {
            // The rows are committed; a revision that cannot be read now leaves it to the endpoint, never fails the answer.
            try { after = await _options.Revision(cancellationToken).ConfigureAwait(false); } catch (Exception error) when (!(error is OperationCanceledException)) { ReportFailure(batch.Rows[0], error); }
        }
        return new CanopyCommitResult(results, after);
    }

    /// <summary>One transaction per row: each row is saved, or rolled back and forgotten, on its own.</summary>
    private async Task<List<CanopyCommitRowResult>> RowsAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) {
        var results = new List<CanopyCommitRowResult>(batch.Rows.Count);
        foreach (var row in batch.Rows) {
            ICanopyWriteTransaction transaction;
            try { transaction = await _store.BeginTransactionAsync(cancellationToken).ConfigureAwait(false); }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception error) {
                ReportFailure(row, error);
                results.Add(CanopyCommitRowResult.Failed(row.Id, Messages.NotSaved));
                continue;
            }
            var result = CanopyCommitRowResult.Failed(row.Id, Messages.NotSaved);
            try {
                result = await RowAsync(batch, row, revision, cancellationToken).ConfigureAwait(false);
                if (result.Status == CanopyCommitStatus.Saved) result = await CommitAsync(transaction, row, result, cancellationToken).ConfigureAwait(false);
                else await RollbackAsync(transaction, row).ConfigureAwait(false);
            } finally {
                if (result.Status != CanopyCommitStatus.Saved) _store.DiscardChanges();
                await DisposeAsync(transaction, row).ConfigureAwait(false);
            }
            results.Add(result);
        }
        return results;
    }

    /// <summary>All or nothing: every row in one transaction, committed only when every row is saved. The first row that
    /// fails stops the batch; the rows before it answer as not saved, the rows after it are not tried.</summary>
    private async Task<List<CanopyCommitRowResult>> BatchAsync(CanopyCommitBatch batch, string revision, CancellationToken cancellationToken) {
        var results = new List<CanopyCommitRowResult>(batch.Rows.Count);
        var transaction = await _store.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);
        var committed = false;
        try {
            foreach (var row in batch.Rows) {
                var result = await RowAsync(batch, row, revision, cancellationToken).ConfigureAwait(false);
                results.Add(result);
                if (result.Status != CanopyCommitStatus.Saved) break;
            }
            if (results.Count == batch.Rows.Count && results.All(result => result.Status == CanopyCommitStatus.Saved)) {
                try {
                    await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
                    committed = true;
                    return results;
                } catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    throw;
                } catch (Exception error) {
                    ReportFailure(batch.Rows[0], error);
                    var conflict = Concurrency(error);
                    return batch.Rows.Select(row => conflict ? CanopyCommitRowResult.Conflict(row.Id, Messages.Conflict) : CanopyCommitRowResult.Failed(row.Id, Messages.NotSaved)).ToList();
                }
            }
            await RollbackAsync(transaction, batch.Rows[0]).ConfigureAwait(false);
        } finally {
            if (!committed) _store.DiscardChanges();
            await DisposeAsync(transaction, batch.Rows[0]).ConfigureAwait(false);
        }
        var answers = new List<CanopyCommitRowResult>(batch.Rows.Count);
        for (var i = 0; i < batch.Rows.Count; i++) {
            var id = batch.Rows[i].Id;
            answers.Add(i < results.Count && results[i].Status != CanopyCommitStatus.Saved ? results[i] : CanopyCommitRowResult.Failed(id, Messages.BatchNotSaved));
        }
        return answers;
    }

    private async Task<CanopyCommitRowResult> CommitAsync(ICanopyWriteTransaction transaction, CanopyCommitRow row, CanopyCommitRowResult saved, CancellationToken cancellationToken) {
        try {
            await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            return saved;
        } catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
            throw;
        } catch (Exception error) {
            ReportFailure(row, error);
            await RollbackAsync(transaction, row).ConfigureAwait(false);
            return Concurrency(error) ? CanopyCommitRowResult.Conflict(row.Id, Messages.Conflict) : CanopyCommitRowResult.Failed(row.Id, Messages.NotSaved);
        }
    }

    /// <summary>Rolls back without letting a failed rollback hide the row's own answer.</summary>
    private async Task RollbackAsync(ICanopyWriteTransaction transaction, CanopyCommitRow row) {
        try { await transaction.RollbackAsync(CancellationToken.None).ConfigureAwait(false); } catch (Exception error) { ReportFailure(row, error); }
    }

    private async Task DisposeAsync(ICanopyWriteTransaction transaction, CanopyCommitRow row) {
        try { await transaction.DisposeAsync().ConfigureAwait(false); } catch (Exception error) { ReportFailure(row, error); }
    }

    private void ReportFailure(CanopyCommitRow row, Exception error) {
        try { _options.Failed?.Invoke(row, error); }
        catch (Exception) {
            // A logger must not change a row's result, skip cleanup, or replace the operation's cancellation.
        }
    }

    /// <summary>Loads, checks, applies and saves one row inside the current transaction.</summary>
    private async Task<CanopyCommitRowResult> RowAsync(CanopyCommitBatch batch, CanopyCommitRow row, string revision, CancellationToken cancellationToken) {
        if (row.Operation == CanopyCommitOperation.Insert) return await InsertAsync(batch, row, cancellationToken).ConfigureAwait(false);
        try {
            var record = await LoadAsync(row.Id, cancellationToken).ConfigureAwait(false);
            if (record == null) return CanopyCommitRowResult.Conflict(row.Id, Messages.Missing);
            // Without a revision source the endpoint's revision may be older than the row, so originals are always compared.
            var compare = _options.AlwaysCompareOriginals || _options.Revision == null || batch.Revision == null ||
                batch.Revision != await _options.Revision(cancellationToken).ConfigureAwait(false);
            if (compare) {
                foreach (var pair in row.Original) {
                    if (!_members[pair.Key].Same(record, pair.Value)) return CanopyCommitRowResult.Conflict(row.Id, Messages.Conflict);
                }
            }
            var failed = Apply(record, row);
            if (failed != null) return failed;
            if (_options.Saving != null) {
                var refusal = await _options.Saving(new CanopyWriteContext<T>(record, row, batch), cancellationToken).ConfigureAwait(false);
                if (refusal != null) return CanopyCommitRowResult.Failed(row.Id, refusal);
            }
            await _store.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return CanopyCommitRowResult.Saved(row.Id, Cells(record, row));
        } catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
            throw;
        } catch (Exception error) {
            ReportFailure(row, error);
            return Concurrency(error) ? CanopyCommitRowResult.Conflict(row.Id, Messages.Conflict) : CanopyCommitRowResult.Failed(row.Id, Messages.NotSaved);
        }
    }

    /// <summary>Converts a row's values to the member types and applies them; a result when a value cannot be held, else null.</summary>
    private CanopyCommitRowResult? Apply(T record, CanopyCommitRow row) {
        var errors = new Dictionary<string, string>(StringComparer.Ordinal);
        var converted = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var pair in row.Values) {
            var column = _map.Schema.GetColumn(pair.Key);
            // Only editable columns have members; a batch built in code that names another column is refused, never written.
            if (!_members.TryGetValue(pair.Key, out var member)) throw new InvalidOperationException("The column is not editable.");
            var problem = member.Convert(pair.Value, Messages, out var value);
            if (problem != null) errors[pair.Key] = column.Validation?.Message ?? CanopyCommitMessages.Fill(problem, column);
            else converted[pair.Key] = value;
        }
        if (errors.Count > 0) return CanopyCommitRowResult.Failed(row.Id, null, errors);
        foreach (var pair in converted) _members[pair.Key].Set(record, pair.Value);
        return null;
    }

    /// <summary>Creates, fills, adds and saves a new record inside the current transaction; it answers the stored identity.</summary>
    private async Task<CanopyCommitRowResult> InsertAsync(CanopyCommitBatch batch, CanopyCommitRow row, CancellationToken cancellationToken) {
        if (_options.NewRecord == null || !(_store is ICanopyInsertStore<T> inserts)) return CanopyCommitRowResult.Failed(row.Id, Messages.InsertRefused);
        try {
            var record = _options.NewRecord(row) ?? throw new InvalidOperationException("NewRecord returned no record.");
            var failed = Apply(record, row);
            if (failed != null) return failed;
            if (_options.Saving != null) {
                var refusal = await _options.Saving(new CanopyWriteContext<T>(record, row, batch), cancellationToken).ConfigureAwait(false);
                if (refusal != null) return CanopyCommitRowResult.Failed(row.Id, refusal);
            }
            inserts.Add(record);
            await _store.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            var id = RecordKeys.Format(_readKey(record));
            // A record without an identity, or outside what the caller may read, is not kept: the transaction rolls it back.
            if (id == null) throw new InvalidOperationException("The new record has no key after saving.");
            if (await LoadAsync(id, cancellationToken).ConfigureAwait(false) == null) return CanopyCommitRowResult.Failed(row.Id, Messages.NotSaved);
            return CanopyCommitRowResult.Saved(row.Id, Cells(record, row), id);
        } catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
            throw;
        } catch (Exception error) {
            ReportFailure(row, error);
            return Concurrency(error) ? CanopyCommitRowResult.Conflict(row.Id, Messages.Conflict) : CanopyCommitRowResult.Failed(row.Id, Messages.NotSaved);
        }
    }

    /// <summary>Loads a record by key, after checking that it lies in the caller's scope; null when it does not exist there.</summary>
    private async Task<T?> LoadAsync(string id, CancellationToken cancellationToken) {
        var type = ExpressionTools.Underlying(_key.Type);
        var key = QueryTranslator<T>.ParseKey(id, type);
        if (key == null) return null;
        var item = _key.Type == type ? _key : Expression.Convert(_key, type);
        var match = Expression.Lambda<Func<T, bool>>(Expression.Equal(item, ExpressionTools.Parameter(key, type)), _row);
        if (_options.Scope != null && await _options.Executor.CountAsync(_options.Scope().Where(match), cancellationToken).ConfigureAwait(false) == 0) return null;
        var found = await _options.Executor.ToListAsync(_store.Records.Where(match).Take(2), cancellationToken).ConfigureAwait(false);
        if (found.Count > 1) throw new InvalidOperationException("The record key is not unique.");
        return found.Count == 0 ? null : found[0];
    }

    /// <summary>The stored values of the changed columns, formatted as page rows format them.</summary>
    private Dictionary<string, CanopyCell> Cells(T record, CanopyCommitRow row) {
        var cells = new Dictionary<string, CanopyCell>(StringComparer.Ordinal);
        foreach (var id in row.Values.Keys) {
            var raw = _members[id].Get(record);
            var format = _map.Get(id).Format;
            var cell = format != null ? format(raw) : CanopyDataValues.ToCell(raw);
            cells[id] = cell!;
        }
        return cells;
    }

    private static MemberInfo? Member(LambdaExpression expression) {
        var body = expression.Body;
        while (body is UnaryExpression unary && (unary.NodeType == ExpressionType.Convert || unary.NodeType == ExpressionType.ConvertChecked)) body = unary.Operand;
        return body is MemberExpression access && access.Expression == expression.Parameters[0] ? access.Member : null;
    }

    private static bool Concurrency(Exception error) {
        for (var current = error; current != null; current = current.InnerException) {
            for (var type = current.GetType(); type != null; type = type.BaseType) if (type.Name == "DbUpdateConcurrencyException") return true;
        }
        return false;
    }

    private sealed class Rebinder : ExpressionVisitor {
        private readonly ParameterExpression _from;
        private readonly Expression _to;
        internal Rebinder(ParameterExpression from, Expression to) { _from = from; _to = to; }
        protected override Expression VisitParameter(ParameterExpression node) => node == _from ? _to : node;
    }
}
