using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq.Expressions;
using System.Reflection;
using System.Text;

namespace CanopyX;

/// <summary>Member paths, ids, titles, kinds, null-safe readers and cells for typed grid authoring.</summary>
internal static class CanopyTypedMembers {
    /// <summary>What a null-safe reader answers when a link of the chain is null.</summary>
    internal static readonly object Missing = new object();

    /// <summary>The members of a chain such as <c>x =&gt; x.Team.Name</c>, outermost first.</summary>
    internal static IReadOnlyList<MemberInfo> Path(LambdaExpression? member) {
        if (member == null) throw new ArgumentNullException(nameof(member));
        return TryPath(member) ?? throw new ArgumentException("The expression must be a member or a chain of members of the record, such as x => x.Team.Name.", nameof(member));
    }

    internal static IReadOnlyList<MemberInfo>? TryPath(LambdaExpression? member) {
        if (member == null || member.Parameters.Count != 1) return null;
        var members = new List<MemberInfo>();
        var body = Unwrap(member.Body);
        while (body is MemberExpression access && access.Expression != null) {
            members.Insert(0, access.Member);
            body = Unwrap(access.Expression);
        }
        return members.Count > 0 && body == member.Parameters[0] ? members : null;
    }

    private static Expression Unwrap(Expression expression) {
        while (expression is UnaryExpression unary && (unary.NodeType == ExpressionType.Convert || unary.NodeType == ExpressionType.ConvertChecked)) expression = unary.Operand;
        return expression;
    }

    /// <summary>The type the last member of a chain holds, whatever the expression converts it to.</summary>
    internal static Type MemberType(IReadOnlyList<MemberInfo> path) => path[path.Count - 1] switch {
        PropertyInfo property => property.PropertyType,
        FieldInfo field => field.FieldType,
        _ => typeof(object)
    };

    /// <summary>
    /// A reader for a member chain that answers <see cref="Missing"/> when a link of the chain is null, as <c>?.</c> would,
    /// instead of throwing: <c>x =&gt; x.Owner.Team</c> reads nothing for a record without an owner.
    /// </summary>
    internal static Func<T, object?> Reader<T>(IReadOnlyList<MemberInfo> path) {
        var record = Expression.Parameter(typeof(T), "record");
        var done = Expression.Label(typeof(object), "done");
        var missing = Expression.Constant(Missing, typeof(object));
        var steps = new List<Expression>();
        var variables = new List<ParameterExpression>();
        Expression current = record;
        foreach (var member in path) {
            if (CanBeNull(current.Type)) steps.Add(Expression.IfThen(Expression.Equal(current, Expression.Constant(null, current.Type)), Expression.Return(done, missing)));
            var next = Expression.Variable(MemberType(new[] { member }), member.Name);
            variables.Add(next);
            steps.Add(Expression.Assign(next, Expression.MakeMemberAccess(current, member)));
            current = next;
        }
        steps.Add(Expression.Label(done, Expression.Convert(current, typeof(object))));
        return Expression.Lambda<Func<T, object?>>(Expression.Block(typeof(object), variables, steps), record).Compile();
    }

    private static bool CanBeNull(Type type) => !type.IsValueType || Nullable.GetUnderlyingType(type) != null;

    /// <summary>The camel-case id of a member path: Team.Name becomes teamName, URL url and IPAddress ipAddress.</summary>
    internal static string Id(IReadOnlyList<MemberInfo> path) {
        var id = new StringBuilder();
        foreach (var member in path) {
            var name = member.Name;
            if (id.Length > 0) { id.Append(char.ToUpperInvariant(name[0])).Append(name, 1, name.Length - 1); continue; }
            // Lower the leading capitals, keeping the last one of a run that starts a word (IPAddress is ipAddress).
            var run = 0;
            while (run < name.Length && char.IsUpper(name[run])) run++;
            var lower = run <= 1 || run == name.Length ? run : run - 1;
            id.Append(name.Substring(0, Math.Max(lower, 1)).ToLowerInvariant()).Append(name, Math.Max(lower, 1), name.Length - Math.Max(lower, 1));
        }
        return id.ToString();
    }

    /// <summary>
    /// The words of a member path as a title, keeping acronyms: LastSeenUtc is "Last seen utc", UserID "User ID", Team.URL
    /// "Team URL".
    /// </summary>
    internal static string Title(IReadOnlyList<MemberInfo> path) {
        var words = new List<string>();
        foreach (var member in path) words.AddRange(Words(member.Name));
        return Title(words);
    }

    internal static string Title(string id) => Title(Words(id));

    private static string Title(List<string> words) {
        var title = new StringBuilder();
        foreach (var word in words) {
            var acronym = word.Length > 1 && IsUpper(word);
            if (title.Length > 0) title.Append(' ');
            title.Append(acronym ? word : title.Length == 0 ? char.ToUpperInvariant(word[0]) + word.Substring(1).ToLowerInvariant() : word.ToLowerInvariant());
        }
        return title.ToString();
    }

    private static bool IsUpper(string word) {
        foreach (var character in word) if (char.IsLetter(character) && !char.IsUpper(character)) return false;
        return true;
    }

    /// <summary>A name's words: a capital starts a word, a run of capitals is one word (an acronym), digits are their own words.</summary>
    private static List<string> Words(string name) {
        var words = new List<string>();
        var start = 0;
        for (var i = 1; i <= name.Length; i++) {
            var boundary = i == name.Length || name[i] == '_' ||
                char.IsUpper(name[i]) && (!char.IsUpper(name[i - 1]) || i + 1 < name.Length && char.IsLower(name[i + 1])) ||
                char.IsDigit(name[i]) != char.IsDigit(name[i - 1]);
            if (!boundary) continue;
            if (i > start && name[start] != '_') words.Add(name.Substring(start, i - start));
            start = i < name.Length && name[i] == '_' ? i + 1 : i;
        }
        return words;
    }

    /// <summary>The column kind a member type writes.</summary>
    internal static CanopyColumnKind Kind(Type type) {
        type = Nullable.GetUnderlyingType(type) ?? type;
        if (type == typeof(DateTime) || type == typeof(DateTimeOffset)) return CanopyColumnKind.DateTime;
#if NET6_0_OR_GREATER
        if (type == typeof(DateOnly)) return CanopyColumnKind.DateTime;
#endif
        if (type.IsEnum) return CanopyColumnKind.Text;
        switch (Type.GetTypeCode(type)) {
            case TypeCode.Byte: case TypeCode.SByte: case TypeCode.Int16: case TypeCode.UInt16: case TypeCode.Int32: case TypeCode.UInt32:
            case TypeCode.Int64: case TypeCode.UInt64: case TypeCode.Single: case TypeCode.Double: case TypeCode.Decimal:
                return CanopyColumnKind.Number;
            default:
                return CanopyColumnKind.Text;
        }
    }

    /// <summary>A value's raw cell: text, numbers, booleans and UTC dates; enumerations by their names.</summary>
    internal static CanopyCell? Cell(object? value) {
        switch (value) {
            case null: return null;
            case CanopyCell cell: return cell;
            case string text: return text;
            case bool flag: return flag;
            case DateTime moment: return moment.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(moment, DateTimeKind.Utc) : moment;
            case DateTimeOffset moment: return moment;
#if NET6_0_OR_GREATER
            case DateOnly day: return day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
#endif
            case decimal number: return number;
            case double number: return number;
            // A float's shortest text keeps 1.1f as 1.1 rather than 1.100000023841858.
            case float number: return double.Parse(number.ToString("R", CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
            case ulong number: return number <= long.MaxValue ? new CanopyCell((long)number) : new CanopyCell((decimal)number);
            case byte or sbyte or short or ushort or int or uint or long: return new CanopyCell(Convert.ToInt64(value, CultureInfo.InvariantCulture));
            case Enum member: return member.ToString();
            default: return Convert.ToString(value, CultureInfo.InvariantCulture);
        }
    }
}
