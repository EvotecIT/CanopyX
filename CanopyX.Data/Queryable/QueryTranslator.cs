using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX.Data;

/// <summary>Translates validated requests into predicates over mapped expressions. Every operand becomes a query parameter.</summary>
internal sealed partial class QueryTranslator<T> {
    private static readonly MethodInfo SearchTextMethod = typeof(CanopyDataValues).GetMethod(nameof(CanopyDataValues.ToSearchText))!;
    private static readonly MethodInfo FoldMethod = typeof(CanopyTextFolding).GetMethod(nameof(CanopyTextFolding.Fold), new[] { typeof(string) })!;
    private static readonly MethodInfo ObjectToString = typeof(object).GetMethod(nameof(ToString), Type.EmptyTypes)!;
    private readonly Dictionary<string, Expression> _values = new Dictionary<string, Expression>(StringComparer.Ordinal);
    private readonly Dictionary<string, Expression> _sorts = new Dictionary<string, Expression>(StringComparer.Ordinal);
    private readonly Dictionary<string, Expression> _search = new Dictionary<string, Expression>(StringComparer.Ordinal);
    private readonly HashSet<string> _neverNull = new HashSet<string>(StringComparer.Ordinal);
    private readonly bool _memory;

    internal QueryTranslator(CanopyColumnMap<T> map, CanopyTextComparison comparison, bool nullSafe) {
        Map = map;
        Comparison = comparison;
        _memory = nullSafe;
        Row = Expression.Parameter(typeof(T), "row");
        Key = ExpressionTools.Bind(map.KeyExpression!, Row, nullSafe);
        foreach (var column in map.Columns) {
            _values[column.Id] = Finite(ExpressionTools.Bind(column.Value, Row, nullSafe));
            if (column.SortBy != null) _sorts[column.Id] = Finite(ExpressionTools.Bind(column.SortBy, Row, nullSafe));
            if (column.SearchBy != null) _search[column.Id] = ExpressionTools.Bind(column.SearchBy, Row, nullSafe);
            var sorted = column.SortBy ?? column.Value;
            var type = ExpressionTools.Underlying(sorted.ReturnType);
            if (type != typeof(float) && type != typeof(double) && (column.NeverNull || ExpressionTools.AnnotatedNotNull(sorted))) _neverNull.Add(column.Id);
        }
    }

    /// <summary>Non-finite real cells are missing in the wire protocol. Use portable comparisons, including in SQL,
    /// rather than a CLR method call, so filters, sort ranks, facets and aggregates share the normalized value.</summary>
    private static Expression Finite(Expression value) {
        var type = ExpressionTools.Underlying(value.Type);
        if (type != typeof(float) && type != typeof(double)) return value;
        var nullable = typeof(Nullable<>).MakeGenericType(type);
        var maximum = type == typeof(float) ? (object)float.MaxValue : double.MaxValue;
        var minimum = type == typeof(float) ? (object)(-float.MaxValue) : -double.MaxValue;
        Expression Bound(object bound) => Expression.Convert(Expression.Constant(bound, type), value.Type);
        var valid = Expression.AndAlso(Expression.GreaterThanOrEqual(value, Bound(minimum)), Expression.LessThanOrEqual(value, Bound(maximum)));
        return Expression.Condition(valid, Expression.Convert(value, nullable), Expression.Constant(null, nullable));
    }

    internal CanopyColumnMap<T> Map { get; }
    internal CanopyTextComparison Comparison { get; }
    internal ParameterExpression Row { get; }
    internal Expression Key { get; }
    internal Expression Value(string id) => _values[id];

    internal Expression<Func<T, bool>>? Where(CanopyDataRequest request) {
        Expression? body = null;
        if (request.Ids != null) body = ExpressionTools.And(body, KeyIn(request.Ids));
        if (request.ExcludedIds.Count != 0) body = ExpressionTools.And(body, Expression.Not(KeyIn(request.ExcludedIds)));
        foreach (var term in request.SearchTerms) body = ExpressionTools.And(body, SearchTerm(request.Schema, term));
        if (request.Filter != null) body = ExpressionTools.And(body, Predicate(request.Filter));
        return body == null ? null : Expression.Lambda<Func<T, bool>>(body, Row);
    }

    internal IQueryable<T> Apply(IQueryable<T> source, CanopyDataRequest request) {
        var where = Where(request);
        return where == null ? source : source.Where(where);
    }

    internal Expression Predicate(CanopyFilterNode node) {
        switch (node) {
            case CanopyFilterConstant constant: return Expression.Constant(constant.Value);
            case CanopyFilterCondition condition: return Condition(condition);
            case CanopyFilterGroup group:
                Expression? body = null;
                foreach (var child in group.Children) {
                    var predicate = Predicate(child);
                    body = group.Junction == CanopyGridFilterJunction.All ? ExpressionTools.And(body, predicate) : ExpressionTools.Or(body, predicate);
                }
                return body!;
            default: throw new ArgumentException("Unknown filter node.", nameof(node));
        }
    }

    private Expression KeyIn(IReadOnlyCollection<string> ids) {
        var type = ExpressionTools.Underlying(Key.Type);
        var keys = new List<object?>();
        foreach (var id in ids) {
            var key = ParseKey(id, type);
            if (key != null) keys.Add(key);
        }
        if (keys.Count == 0) return Expression.Constant(false);
        var item = Key.Type == type ? Key : Expression.Convert(Key, type);
        return ExpressionTools.InList(item, keys);
    }

    internal static object? ParseKey(string id, Type type) {
        if (type == typeof(string)) return id;
        if (type == typeof(Guid)) return Guid.TryParse(id, out var guid) ? guid : (object?)null;
        if (type == typeof(int) || type == typeof(long) || type == typeof(short) || type == typeof(uint) || type == typeof(ushort) || type == typeof(byte) || type == typeof(sbyte) || type == typeof(ulong)) {
            if (!decimal.TryParse(id, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var number)) return null;
            try { return Convert.ChangeType(number, type, CultureInfo.InvariantCulture); }
            catch (OverflowException) { return null; }
        }
        throw new CanopyRequestException(CanopyRequestError.Unsupported, "Record identities of this endpoint cannot be selected.");
    }

    private Expression SearchTerm(CanopyDataSchema schema, string term) {
        Expression? any = null;
        foreach (var column in schema.SearchColumns) {
            var match = SearchMatch(column, term);
            if (match != null) any = ExpressionTools.Or(any, match);
        }
        return any ?? Expression.Constant(false);
    }

    private Expression? SearchMatch(CanopyDataColumn column, string term) {
        var mapped = Map.Get(column.Id);
        if (_search.TryGetValue(column.Id, out var alias)) return TextContains(alias, term);
        var value = _values[column.Id];
        switch (mapped.Shape) {
            case ValueShape.Text: return TextContains(value, term);
            case ValueShape.Boolean:
            case ValueShape.Enum:
                var folded = CanopyTextFolding.Fold(term)!;
                return Domain(value, mapped.Shape, member => ProtocolSemantics.ContainsTerm(member, folded));
        }
        // Databases search numbers through their text form only when the view lists the column; dates have no portable text form.
        if (Comparison != CanopyTextComparison.Canonical && !column.ExplicitlySearchable) return null;
        return RawTextContains(value, mapped.Shape, term);
    }

    /// <summary>Restricts a value list to buckets whose raw value contains the search text, case-insensitively.</summary>
    internal IQueryable<T> ValueSearch(IQueryable<T> source, string column, string search) {
        if (search.Length == 0) return source;
        var mapped = Map.Get(column);
        var value = _values[column];
        Expression? test = mapped.Shape switch {
            ValueShape.Text => TextContains(value, search),
            ValueShape.Boolean or ValueShape.Enum => Domain(value, mapped.Shape, member => ProtocolSemantics.ContainsTerm(member, CanopyTextFolding.Fold(search)!)),
            _ => RawTextContains(value, mapped.Shape, search)
        };
        if (test == null) throw new CanopyRequestException(CanopyRequestError.Unsupported, "Value search is not available for date columns on this endpoint.");
        return source.Where(Expression.Lambda<Func<T, bool>>(test, Row));
    }

    /// <summary>Matches the text form of a number (or, in memory, a date) against a term; null when the store has no such text form.</summary>
    private Expression? RawTextContains(Expression value, ValueShape shape, string term) {
        if (Comparison == CanopyTextComparison.Canonical) {
            var text = Expression.Call(SearchTextMethod, Expression.Convert(value, typeof(object)));
            return Expression.AndAlso(ExpressionTools.NotNull(text), Expression.Call(Expression.Call(FoldMethod, text),
                ExpressionTools.ContainsMethod, ExpressionTools.Parameter(CanopyTextFolding.Fold(term), typeof(string))));
        }
        if (shape == ValueShape.DateTime || shape == ValueShape.DateTimeOffset || shape == ValueShape.DateOnly) return null;
        var underlying = ExpressionTools.Underlying(value.Type);
        var plain = value.Type == underlying ? value : Expression.Convert(value, underlying);
        var asText = Expression.Call(plain, underlying.GetMethod(nameof(ToString), Type.EmptyTypes) ?? ObjectToString);
        var contains = Expression.Call(asText, ExpressionTools.ContainsMethod, ExpressionTools.Parameter(term, typeof(string)));
        return ExpressionTools.IsNullable(value.Type) ? Expression.AndAlso(ExpressionTools.NotNull(value), contains) : contains;
    }
    private Expression TextContains(Expression text, string term) => Expression.AndAlso(ExpressionTools.NotNull(text),
        Expression.Call(ExpressionTools.Fold(text, Comparison), ExpressionTools.ContainsMethod, ExpressionTools.Parameter(ExpressionTools.FoldOperand(term, Comparison), typeof(string))));

    /// <summary>Tests a finite domain (booleans, enumeration members) member by member with the exact protocol rules, then matches the members that pass.</summary>
    private static Expression Domain(Expression value, ValueShape shape, Func<object, bool> passes) {
        var type = ExpressionTools.Underlying(value.Type);
        var members = shape == ValueShape.Boolean ? new object[] { false, true } : EnumDomains.Members(type);
        var matching = members.Where(member => passes(shape == ValueShape.Boolean ? member : CanopyDataValues.EnumText((Enum)member))).ToList();
        if (matching.Count == 0) return Expression.Constant(false);
        var guard = ExpressionTools.IsNullable(value.Type) ? ExpressionTools.NotNull(value) : null;
        if (shape == ValueShape.Boolean && matching.Count == members.Length) return guard ?? Expression.Constant(true);
        if (matching.Count > 8) {
            var plain = value.Type == type ? value : Expression.Convert(value, type);
            var contains = ExpressionTools.InList(plain, matching);
            return guard == null ? contains : Expression.AndAlso(guard, contains);
        }
        Expression? any = null;
        foreach (var member in matching) any = ExpressionTools.Or(any, Expression.Equal(value, ExpressionTools.Parameter(member, value.Type)));
        return any!;
    }
}
