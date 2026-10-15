using System;
using System.Collections.Generic;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>Maps the child rows of a record's change list (<see cref="CanopyRecordMap{T}.Changes"/>) to before/after values:
/// the field name, the value before and after, and their order.</summary>
/// <typeparam name="TChild">The change row type.</typeparam>
/// <remarks>
/// Changes come in the <see cref="OrderBy"/> order (missing values last), then by the child key ascending; a record carries
/// the first <see cref="Limit"/> of them (capped by <see cref="CanopyRemoteLimits.MaxRecordItems"/> and the protocol's 512).
/// Values convert as column values do; numbers and dates keep their kind for formatting.
/// </remarks>
public sealed class CanopyRecordChangesMap<TChild> {
    private readonly List<(LambdaExpression Expression, bool Descending)> _orders = new List<(LambdaExpression, bool)>();
    private LambdaExpression? _key, _name, _before, _after;
    private CanopyColumnKind _kind = CanopyColumnKind.Text;
    private int _limit = 50;

    internal CanopyRecordChangesMap() { }

    /// <summary>Maps the change key: unique among the record's changes and the final order key.</summary>
    /// <typeparam name="TKey">The key type: text, a GUID or an integer.</typeparam>
    /// <param name="key">The key expression.</param>
    /// <returns>This map.</returns>
    public CanopyRecordChangesMap<TChild> Key<TKey>(Expression<Func<TChild, TKey>> key) {
        if (!RecordKeys.Supported(typeof(TKey))) throw new ArgumentException("A change key is text, a GUID or an integer.", nameof(key));
        _key = key ?? throw new ArgumentNullException(nameof(key));
        return this;
    }

    /// <summary>Maps the visible name of the changed field.</summary>
    /// <param name="name">The name expression.</param>
    /// <returns>This map.</returns>
    public CanopyRecordChangesMap<TChild> Name(Expression<Func<TChild, string?>> name) {
        _name = name ?? throw new ArgumentNullException(nameof(name));
        return this;
    }

    /// <summary>Maps the value before the change.</summary>
    /// <typeparam name="TValue">The value type: text, a boolean, an enumeration, a number or a date.</typeparam>
    /// <param name="before">The value expression.</param>
    /// <returns>This map.</returns>
    public CanopyRecordChangesMap<TChild> Before<TValue>(Expression<Func<TChild, TValue>> before) {
        _kind = Kind(typeof(TValue));
        _before = before ?? throw new ArgumentNullException(nameof(before));
        return this;
    }

    /// <summary>Maps the value after the change.</summary>
    /// <typeparam name="TValue">The value type: text, a boolean, an enumeration, a number or a date.</typeparam>
    /// <param name="after">The value expression.</param>
    /// <returns>This map.</returns>
    public CanopyRecordChangesMap<TChild> After<TValue>(Expression<Func<TChild, TValue>> after) {
        _kind = Kind(typeof(TValue));
        _after = after ?? throw new ArgumentNullException(nameof(after));
        return this;
    }

    /// <summary>Orders the changes by a key before the change key; call again for further keys.</summary>
    /// <typeparam name="TKey">The order key type.</typeparam>
    /// <param name="key">The order key expression.</param>
    /// <param name="descending">True for descending order (missing values still come last).</param>
    /// <returns>This map.</returns>
    public CanopyRecordChangesMap<TChild> OrderBy<TKey>(Expression<Func<TChild, TKey>> key, bool descending = false) {
        _orders.Add((key ?? throw new ArgumentNullException(nameof(key)), descending));
        return this;
    }

    /// <summary>Sets how many changes a record carries, 1 to 512. Default 50.</summary>
    /// <param name="changes">The change limit.</param>
    /// <returns>This map.</returns>
    public CanopyRecordChangesMap<TChild> Limit(int changes) {
        if (changes < 1 || changes > 512) throw new ArgumentOutOfRangeException(nameof(changes), changes, "A change list holds 1 to 512 changes.");
        _limit = changes;
        return this;
    }

    private static CanopyColumnKind Kind(Type type) => ValueShapes.Of(type, "change") switch {
        ValueShape.Integer or ValueShape.Real or ValueShape.Decimal => CanopyColumnKind.Number,
        ValueShape.DateTime or ValueShape.DateTimeOffset or ValueShape.DateOnly => CanopyColumnKind.DateTime,
        _ => CanopyColumnKind.Text
    };

    internal ChildSpec<TChild> Build(string field) {
        var key = _key ?? throw new InvalidOperationException("Change list '" + field + "' needs a change key (Key).");
        var name = _name ?? throw new InvalidOperationException("Change list '" + field + "' needs the changed field's name (Name).");
        if (_before == null && _after == null) throw new InvalidOperationException("Change list '" + field + "' needs a value before or after (Before, After).");
        var values = new List<LambdaExpression> { name };
        int before = -1, after = -1;
        if (_before != null) { before = values.Count + 1; values.Add(_before); }
        if (_after != null) { after = values.Count + 1; values.Add(_after); }
        var kind = _kind;
        return new ChildSpec<TChild>(key, _orders.ToArray(), values, false, _limit, (rows, _) => {
            var changes = new List<CanopyFieldChange>(rows.Count);
            foreach (var row in rows) {
                changes.Add(new CanopyFieldChange(ChildSpec<TChild>.Text(row[1], 4096, true),
                    before > 0 ? CanopyDataValues.ToCell(row[before]) : null, after > 0 ? CanopyDataValues.ToCell(row[after]) : null) { Kind = kind });
            }
            return CanopyCell.Diff(changes);
        });
    }
}
