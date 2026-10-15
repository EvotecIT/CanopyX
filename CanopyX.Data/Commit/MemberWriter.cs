using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;

namespace CanopyX.Data;

/// <summary>Writes one mapped column of a record: the mapped expression must be a member of the record itself, such as
/// <c>x =&gt; x.Cores</c>; raw protocol values are converted to the member's type with range and membership checks.</summary>
internal sealed class MemberWriter<T> {
    private readonly Func<T, object?> _get;
    private readonly Action<T, object?> _set;
    private readonly Type _underlying;
    private readonly bool _nullable;
    private readonly Dictionary<string, object>? _members;

    private MemberWriter(MemberInfo member, Type type, bool nullable) {
        _underlying = ExpressionTools.Underlying(type);
        _nullable = nullable;
        var record = Expression.Parameter(typeof(T), "record");
        var value = Expression.Parameter(typeof(object), "value");
        _get = Expression.Lambda<Func<T, object?>>(Expression.Convert(Expression.MakeMemberAccess(record, member), typeof(object)), record).Compile();
        _set = Expression.Lambda<Action<T, object?>>(Expression.Assign(Expression.MakeMemberAccess(record, member), Expression.Convert(value, type)), record, value).Compile();
        if (_underlying.IsEnum) {
            _members = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (Enum item in Enum.GetValues(_underlying)) {
                var text = CanopyDataValues.EnumText(item);
                if (!_members.ContainsKey(text)) _members[text] = item;
            }
        }
    }

    /// <summary>A writer for a mapped expression, or null with the reason when the expression cannot be written.</summary>
    internal static MemberWriter<T>? Create(LambdaExpression expression, out string? reason) {
        reason = null;
        var body = expression.Body;
        while (body is UnaryExpression unary && (unary.NodeType == ExpressionType.Convert || unary.NodeType == ExpressionType.ConvertChecked)) body = unary.Operand;
        if (!(body is MemberExpression access) || access.Expression != expression.Parameters[0]) {
            reason = "it is not a member of the record itself";
            return null;
        }
        switch (access.Member) {
            case PropertyInfo property when property.GetSetMethod(true) != null:
                return new MemberWriter<T>(property, property.PropertyType, Nullable(property.PropertyType, property));
            case FieldInfo field when !field.IsInitOnly && !field.IsLiteral:
                return new MemberWriter<T>(field, field.FieldType, Nullable(field.FieldType, field));
            default:
                reason = "the member has no setter";
                return null;
        }
    }

    /// <summary>Whether the member accepts null: nullable value types, and reference types not annotated as non-nullable.</summary>
    private static bool Nullable(Type type, MemberInfo member) {
        if (type.IsValueType) return System.Nullable.GetUnderlyingType(type) != null;
#if NET6_0_OR_GREATER
        var context = new NullabilityInfoContext();
        var state = member switch {
            PropertyInfo property => context.Create(property).WriteState,
            FieldInfo field => context.Create(field).WriteState,
            _ => NullabilityState.Unknown
        };
        return state != NullabilityState.NotNull;
#else
        _ = member;
        return true;
#endif
    }

    /// <summary>Reads the stored value.</summary>
    internal object? Get(T record) => _get(record);

    /// <summary>Converts a checked raw value to the member's type; returns the message key of a value it cannot hold.</summary>
    internal string? Convert(object? value, CanopyCommitMessages messages, out object? converted) {
        converted = null;
        if (value == null) return _nullable ? null : messages.Required;
        var t = _underlying;
        if (t == typeof(string)) {
            if (!(value is string text)) return messages.Type;
            converted = text;
            return null;
        }
        if (t == typeof(bool)) {
            if (!(value is bool flag)) return messages.Type;
            converted = flag;
            return null;
        }
        if (_members != null) {
            if (!(value is string name) || !_members.TryGetValue(name, out var member)) return messages.Choice;
            converted = member;
            return null;
        }
        if (value is double number) {
            if (t == typeof(double)) { converted = number; return null; }
            if (t == typeof(float)) { converted = (float)number; return null; }
            if (t == typeof(decimal)) { converted = (decimal)number; return null; }
            var (minimum, maximum) = ValueShapes.Range(t);
            if (number != Math.Floor(number) || number < minimum || number > maximum) return messages.WholeNumber;
            converted = System.Convert.ChangeType((long)number, t, CultureInfo.InvariantCulture);
            return null;
        }
        if (value is DateTime instant) {
            var utc = DateTime.SpecifyKind(instant, DateTimeKind.Utc);
            if (t == typeof(DateTime)) { converted = utc; return null; }
            if (t == typeof(DateTimeOffset)) { converted = new DateTimeOffset(utc, TimeSpan.Zero); return null; }
#if NET6_0_OR_GREATER
            if (t == typeof(DateOnly)) {
                if (utc.TimeOfDay != TimeSpan.Zero) return messages.Date;
                converted = DateOnly.FromDateTime(utc);
                return null;
            }
#endif
        }
        return messages.Type;
    }

    /// <summary>Sets a converted value.</summary>
    internal void Set(T record, object? converted) => _set(record, converted);

    /// <summary>Whether a stored value is the value the reader started from, at the protocol's precision (text exactly,
    /// numbers as binary64, dates to the millisecond, enumerations by their raw text).</summary>
    internal bool Same(T record, object? original) {
        var stored = CanopyDataValues.Normalize(Get(record));
        var started = CanopyDataValues.Normalize(original);
        return CanopyRemoteHandler.GroupKey(stored) == CanopyRemoteHandler.GroupKey(started);
    }
}
