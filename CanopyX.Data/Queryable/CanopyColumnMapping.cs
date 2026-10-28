using System;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>Optional behaviour of one mapped column.</summary>
/// <typeparam name="T">The record type.</typeparam>
/// <typeparam name="TValue">The mapped value type.</typeparam>
public sealed class CanopyColumnMapping<T, TValue> {
    private readonly MappedColumn _column;

    internal CanopyColumnMapping(MappedColumn column) { _column = column; }

    /// <summary>Maps an explicit provider-translatable local calendar value for buckets in a named time zone.</summary>
    /// <param name="timeZone">The bucket's exact time-zone identifier.</param>
    /// <param name="localTime">A local calendar expression supplied by the host, including its daylight-saving conversion.</param>
    /// <returns>This mapping.</returns>
    /// <remarks>UTC buckets need no mapping. Relational providers have different time-zone functions; the host supplies its native conversion.</remarks>
    public CanopyColumnMapping<T, TValue> BucketTimeZone(string timeZone, Expression<Func<T, DateTime?>> localTime) {
        if (string.IsNullOrWhiteSpace(timeZone) || timeZone.Length > 128) throw new ArgumentException("A bounded time-zone identifier is required.", nameof(timeZone));
        _column.BucketTimes[timeZone] = localTime ?? throw new ArgumentNullException(nameof(localTime));
        return this;
    }

    /// <summary>Sorts the column by another expression, for example a sortable key beside a display name.</summary>
    /// <typeparam name="TKey">The sort key type.</typeparam>
    /// <param name="key">The sort key expression.</param>
    /// <returns>This mapping.</returns>
    public CanopyColumnMapping<T, TValue> SortBy<TKey>(Expression<Func<T, TKey>> key) {
        _column.SortBy = key ?? throw new ArgumentNullException(nameof(key));
        return this;
    }

    /// <summary>Lets quick search read another text expression for this column, for example a joined alias list.</summary>
    /// <param name="text">The search text expression.</param>
    /// <returns>This mapping.</returns>
    public CanopyColumnMapping<T, TValue> SearchBy(Expression<Func<T, string?>> text) {
        _column.SearchBy = text ?? throw new ArgumentNullException(nameof(text));
        return this;
    }

    /// <summary>Formats the cell written for each record: display text, tone, badges or a tooltip.</summary>
    /// <param name="format">Creates the cell from the raw value. Its <see cref="CanopyCell.Value"/> must keep the raw value
    /// so sorting, filtering and raw exports stay consistent; return null for an empty cell.</param>
    /// <returns>This mapping.</returns>
    public CanopyColumnMapping<T, TValue> Cell(Func<TValue, CanopyCell?> format) {
        if (format == null) throw new ArgumentNullException(nameof(format));
        _column.Format = value => format(value is TValue typed ? typed : default!);
        return this;
    }

    /// <summary>Declares that the value is never null, so sorting needs no missing-values-last key and a database can use an index.</summary>
    /// <returns>This mapping.</returns>
    /// <remarks>On .NET 6 and later, member chains whose nullable reference annotations are all non-nullable are detected automatically.</remarks>
    public CanopyColumnMapping<T, TValue> NotNull() {
        _column.NeverNull = true;
        return this;
    }

    /// <summary>Allows or forbids filtering on the column. Forbidden columns can still be read and sorted.</summary>
    /// <param name="filterable">True to allow filters.</param>
    /// <returns>This mapping.</returns>
    public CanopyColumnMapping<T, TValue> Filterable(bool filterable = true) {
        _column.Filterable = filterable;
        return this;
    }
}
