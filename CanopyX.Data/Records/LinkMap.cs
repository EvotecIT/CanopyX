using System.Collections.Generic;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>A link to a related record: the record's key and an optional text; no key is an empty value. A link kept within
/// the grid shows only when the related record belongs to the caller's scoped query.</summary>
internal sealed class LinkMap<T> : RecordValueMap<T> {
    private readonly LambdaExpression[] _parts;
    private readonly string? _view;
    private readonly bool _withinGrid;

    internal LinkMap(string id, LambdaExpression target, LambdaExpression? text, string? view, bool withinGrid) : base(id) {
        _parts = text == null ? new[] { target } : new[] { target, text };
        _view = view;
        _withinGrid = withinGrid;
    }

    internal override IReadOnlyList<LambdaExpression> Parts => _parts;

    internal override bool IsText(int part) => part == 1;

    internal override LambdaExpression? ScopeTarget => _withinGrid ? _parts[0] : null;

    internal override CanopyCell? Build(IReadOnlyList<object?> values, int start) {
        var id = RecordKeys.Format(values[start]);
        if (id == null) return null;
        var text = _parts.Length > 1 ? values[start + 1] as string : null;
        return CanopyCell.Link(string.IsNullOrEmpty(text) ? id : text!, id, _view);
    }
}
