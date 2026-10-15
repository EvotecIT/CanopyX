using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>A mapped record field (or a column's drawer value): its identity and how it is read.</summary>
internal abstract class RecordFieldMap<T> {
    protected RecordFieldMap(string id) { Id = id; }

    internal string Id { get; }
}

/// <summary>A value read with the record itself, in its one projection: a scalar, a link or a column's drawer value.</summary>
internal abstract class RecordValueMap<T> : RecordFieldMap<T> {
    protected RecordValueMap(string id) : base(id) { }

    /// <summary>The expressions the record's projection reads for this value, in order.</summary>
    internal abstract IReadOnlyList<LambdaExpression> Parts { get; }

    /// <summary>The cell from the projected values of <see cref="Parts"/>, starting at <paramref name="start"/>; null for an empty value.</summary>
    internal abstract CanopyCell? Build(IReadOnlyList<object?> values, int start);
}

/// <summary>A scalar value: text, a boolean, an enumeration, a number or a date, converted as column values are.</summary>
internal sealed class ScalarMap<T> : RecordValueMap<T> {
    private readonly LambdaExpression[] _parts;
    private readonly Func<object?, CanopyCell?>? _format;

    internal ScalarMap(string id, LambdaExpression value, Func<object?, CanopyCell?>? format) : base(id) {
        _parts = new[] { value };
        _format = format;
    }

    internal override IReadOnlyList<LambdaExpression> Parts => _parts;

    internal override CanopyCell? Build(IReadOnlyList<object?> values, int start) =>
        _format != null ? _format(values[start]) : CanopyDataValues.ToCell(values[start]);
}

/// <summary>A link to a related record: the record's key and an optional text; no key is an empty value.</summary>
internal sealed class LinkMap<T> : RecordValueMap<T> {
    private readonly LambdaExpression[] _parts;
    private readonly string? _view;

    internal LinkMap(string id, LambdaExpression target, LambdaExpression? text, string? view) : base(id) {
        _parts = text == null ? new[] { target } : new[] { target, text };
        _view = view;
    }

    internal override IReadOnlyList<LambdaExpression> Parts => _parts;

    internal override CanopyCell? Build(IReadOnlyList<object?> values, int start) {
        var id = RecordKeys.Format(values[start]);
        if (id == null) return null;
        var text = _parts.Length > 1 ? values[start + 1] as string : null;
        return CanopyCell.Link(string.IsNullOrEmpty(text) ? id : text!, id, _view);
    }
}

/// <summary>A field read through the record's child rows: a collection, a timeline or a change list.</summary>
internal abstract class RecordChildMap<T> : RecordFieldMap<T> {
    protected RecordChildMap(string id) : base(id) { }

    /// <summary>Whether the field is a collection whose rows page.</summary>
    internal abstract bool Collection { get; }

    /// <summary>The page size of a collection, or the item limit of a timeline or change list.</summary>
    internal abstract int Size { get; }

    /// <summary>Reads the child rows of the one record <paramref name="scoped"/> holds: a window of them (and for collections the
    /// total). A whole-record answer gets null for no rows; a page always gets its (possibly empty) rows.</summary>
    internal abstract Task<CanopyCell?> QueryAsync(IQueryable<T> scoped, bool memory, int offset, int take, bool page, CanopyQueryExecutor executor, CancellationToken cancellationToken);

    /// <summary>The same rows evaluated in memory over one record, for the reference provider.</summary>
    internal abstract CanopyCell? Evaluate(T record, int offset, int take, bool page);
}
