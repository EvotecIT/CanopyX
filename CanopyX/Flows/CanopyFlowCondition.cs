using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A condition of a flow step, section or field: a predicate on one field's answer, or a group of conditions that must all,
/// any or none hold. Conditions are data, never script, in the filter builder's grammar; C# and the browser evaluate them the
/// same way (see "Conditions" in docs/flow.md).
/// </summary>
/// <remarks>
/// <para>
/// Text compares without case, with the search folding (<see cref="CanopyTextFolding"/>), and orders by UTF-16 code units
/// after folding; numbers compare as numbers, and booleans only with <see cref="CanopyFlowOperator.Equal"/>,
/// <see cref="CanopyFlowOperator.NotEqual"/> and the lists of <see cref="CanopyFlowOperator.In"/>. Values never convert: an
/// answer of another type than the value is never equal to it (<see cref="CanopyFlowOperator.NotEqual"/> and
/// <see cref="CanopyFlowOperator.NotIn"/> hold, the other tests fail). The text tests (contains, starts with, ends with and the
/// patterns, with their negations) hold only for text; patterns test the first 4,096 UTF-16 code units without case.
/// An empty answer (missing, null, empty text or an array without items) matches only <see cref="CanopyFlowOperator.IsEmpty"/>:
/// every other test, the negated ones included, fails on it. For an array answer, <see cref="CanopyFlowOperator.Contains"/>
/// and <see cref="CanopyFlowOperator.NotContains"/> test whether one item equals the value, <see cref="CanopyFlowOperator.In"/>
/// and <see cref="CanopyFlowOperator.NotIn"/> whether any item is listed, and the other tests fail.
/// </para>
/// <para>
/// A condition holds at most eight levels, 64 groups and 64 predicates; a predicate on its own counts as a group of one.
/// </para>
/// </remarks>
public sealed class CanopyFlowCondition {
    internal const int MaxLevels = 8;
    internal const int MaxGroups = 64;
    internal const int MaxPredicates = 64;
    internal const int MaxValues = 1000;

    private static readonly object[] NoValues = new object[0];
    private static readonly CanopyFlowCondition[] NoConditions = new CanopyFlowCondition[0];
    private CanopyNativePattern? _pattern;

    private CanopyFlowCondition(string field, CanopyFlowOperator op, object[] values) {
        Field = field;
        Operator = op;
        Values = values;
        Conditions = NoConditions;
    }

    private CanopyFlowCondition(CanopyFlowGroupOperator group, CanopyFlowCondition[] conditions) {
        IsGroup = true;
        GroupOperator = group;
        Values = NoValues;
        Conditions = conditions;
    }

    /// <summary>Gets whether this condition is a group of conditions rather than a predicate.</summary>
    public bool IsGroup { get; }

    /// <summary>Gets how a group combines its <see cref="Conditions"/>; <see cref="CanopyFlowGroupOperator.All"/> for a predicate.</summary>
    public CanopyFlowGroupOperator GroupOperator { get; }

    /// <summary>Gets the conditions of a group; empty for a predicate.</summary>
    public IReadOnlyList<CanopyFlowCondition> Conditions { get; }

    /// <summary>Gets the field a predicate tests; null for a group.</summary>
    public string? Field { get; }

    /// <summary>Gets a predicate's test; <see cref="CanopyFlowOperator.Equal"/> for a group.</summary>
    public CanopyFlowOperator Operator { get; }

    /// <summary>Gets a predicate's values: text, numbers (as doubles) or booleans; empty for a group.</summary>
    public IReadOnlyList<object> Values { get; }

    /// <summary>Holds when a field's answer equals a value.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">Text (compared without case), a number or true or false.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition Equal(string field, object value) => Predicate(field, CanopyFlowOperator.Equal, value);

    /// <summary>Holds when a field's answer does not equal a value (also when it is empty).</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">Text, a number or true or false.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition NotEqual(string field, object value) => Predicate(field, CanopyFlowOperator.NotEqual, value);

    /// <summary>Holds when a field's answer is greater than a value of its type (a number, or text in folded ordinal order).</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">A number or text.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition GreaterThan(string field, object value) => Predicate(field, CanopyFlowOperator.GreaterThan, value);

    /// <summary>Holds when a field's answer is greater than or equal to a value of its type.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">A number or text.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition GreaterOrEqual(string field, object value) => Predicate(field, CanopyFlowOperator.GreaterOrEqual, value);

    /// <summary>Holds when a field's answer is less than a value of its type.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">A number or text.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition LessThan(string field, object value) => Predicate(field, CanopyFlowOperator.LessThan, value);

    /// <summary>Holds when a field's answer is less than or equal to a value of its type.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">A number or text.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition LessOrEqual(string field, object value) => Predicate(field, CanopyFlowOperator.LessOrEqual, value);

    /// <summary>Holds when a text answer contains a text without case, or an array answer holds a value.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">Text, or for array answers any item value.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition Contains(string field, object value) => Predicate(field, CanopyFlowOperator.Contains, value);

    /// <summary>Holds when <see cref="Contains"/> does not.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">Text, or for array answers any item value.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition NotContains(string field, object value) => Predicate(field, CanopyFlowOperator.NotContains, value);

    /// <summary>Holds when a text answer starts with a text, without case.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">The text.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition StartsWith(string field, string value) => Predicate(field, CanopyFlowOperator.StartsWith, value);

    /// <summary>Holds when a text answer ends with a text, without case.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="value">The text.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the value is not valid.</exception>
    public static CanopyFlowCondition EndsWith(string field, string value) => Predicate(field, CanopyFlowOperator.EndsWith, value);

    /// <summary>Holds when a text answer matches a bounded pattern, without case. The pattern uses the grammar of formatting
    /// patterns: literals, character classes and at most one variable repetition, anchored at the start with <c>^</c>.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="pattern">The pattern.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the pattern is not valid.</exception>
    public static CanopyFlowCondition Matches(string field, string pattern) => Predicate(field, CanopyFlowOperator.Matches, pattern);

    /// <summary>Holds when <see cref="Matches"/> does not.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="pattern">The pattern.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the pattern is not valid.</exception>
    public static CanopyFlowCondition NotMatches(string field, string pattern) => Predicate(field, CanopyFlowOperator.NotMatches, pattern);

    /// <summary>Holds when a field's answer equals one of 1 to 1,000 values, or an array answer holds any of them.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="values">The values.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the values are not valid.</exception>
    public static CanopyFlowCondition In(string field, params object[] values) => Predicate(field, CanopyFlowOperator.In, values);

    /// <summary>Holds when <see cref="In"/> does not.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="values">The values.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the values are not valid.</exception>
    public static CanopyFlowCondition NotIn(string field, params object[] values) => Predicate(field, CanopyFlowOperator.NotIn, values);

    /// <summary>Holds when a field's answer lies between two values of its type, both included.</summary>
    /// <param name="field">The field id.</param>
    /// <param name="low">The lower value: a number or text.</param>
    /// <param name="high">The upper value, of the same type and not below <paramref name="low"/>.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id or the values are not valid.</exception>
    public static CanopyFlowCondition Between(string field, object low, object high) => Predicate(field, CanopyFlowOperator.Between, low, high);

    /// <summary>Holds when a field's answer is empty: missing, null, an empty string or an array without items. A hidden field reads as empty.</summary>
    /// <param name="field">The field id.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id is not valid.</exception>
    public static CanopyFlowCondition IsEmpty(string field) => Predicate(field, CanopyFlowOperator.IsEmpty);

    /// <summary>Holds when <see cref="IsEmpty"/> does not.</summary>
    /// <param name="field">The field id.</param>
    /// <returns>The predicate.</returns>
    /// <exception cref="ArgumentException">The field id is not valid.</exception>
    public static CanopyFlowCondition IsNotEmpty(string field) => Predicate(field, CanopyFlowOperator.IsNotEmpty);

    /// <summary>Holds when every condition holds.</summary>
    /// <param name="conditions">One or more conditions.</param>
    /// <returns>The group.</returns>
    /// <exception cref="ArgumentException">No condition is given, or one is null.</exception>
    public static CanopyFlowCondition All(params CanopyFlowCondition[] conditions) => Group(CanopyFlowGroupOperator.All, conditions);

    /// <summary>Holds when at least one condition holds.</summary>
    /// <param name="conditions">One or more conditions.</param>
    /// <returns>The group.</returns>
    /// <exception cref="ArgumentException">No condition is given, or one is null.</exception>
    public static CanopyFlowCondition Any(params CanopyFlowCondition[] conditions) => Group(CanopyFlowGroupOperator.Any, conditions);

    /// <summary>Holds when no condition holds.</summary>
    /// <param name="conditions">One or more conditions.</param>
    /// <returns>The group.</returns>
    /// <exception cref="ArgumentException">No condition is given, or one is null.</exception>
    public static CanopyFlowCondition None(params CanopyFlowCondition[] conditions) => Group(CanopyFlowGroupOperator.None, conditions);

    /// <summary>Evaluates the condition over answers by field id. A missing answer is empty.</summary>
    /// <param name="values">The answers: text, numbers, booleans, dates, time spans, or sequences of them.</param>
    /// <returns>Whether the condition holds.</returns>
    /// <remarks>This reads the answers as they are. <see cref="CanopyFlow.VisibleValues"/> also reads hidden fields as empty.</remarks>
    /// <exception cref="ArgumentNullException"><paramref name="values"/> is null.</exception>
    public bool Evaluate(IReadOnlyDictionary<string, object?> values) {
        if (values == null) throw new ArgumentNullException(nameof(values));
        return EvaluateWith(field => values.TryGetValue(field, out var value) ? CanopyFlowValues.Generic(value) : null);
    }

    /// <summary>Writes the condition as its contract JSON: always a group, so a predicate becomes an <c>and</c> group of one.</summary>
    /// <returns>Compact JSON.</returns>
    /// <exception cref="InvalidOperationException">The condition exceeds eight levels, 64 groups or 64 predicates.</exception>
    public string ToContract() {
        Validate();
        var writer = new CanopyJsonWriter();
        WriteJson(writer);
        return writer.ToString();
    }

    /// <summary>Reads a condition from its contract JSON.</summary>
    /// <param name="json">A condition group: <c>{ "operator", "filters", "groups" }</c>.</param>
    /// <returns>The condition, always a group.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="json"/> is null.</exception>
    /// <exception cref="FormatException">The text is not valid JSON.</exception>
    /// <exception cref="InvalidOperationException">The JSON is not a valid condition.</exception>
    public static CanopyFlowCondition FromContract(string json) {
        var condition = Read(CanopyJsonReader.Parse(json), "The condition");
        condition.Validate();
        return condition;
    }

    private static CanopyFlowCondition Predicate(string field, CanopyFlowOperator op, params object[] values) {
        CanopyFlowValues.RequireIdentifier(field, nameof(field), "A condition field");
        if (values == null) throw new ArgumentNullException(nameof(values));
        try {
            return Create(field, op, values);
        } catch (InvalidOperationException error) {
            throw new ArgumentException(error.Message, nameof(values), error);
        }
    }

    private static CanopyFlowCondition Group(CanopyFlowGroupOperator group, CanopyFlowCondition[] conditions) {
        if (conditions == null) throw new ArgumentNullException(nameof(conditions));
        if (conditions.Length == 0) throw new ArgumentException("A condition group needs at least one condition.", nameof(conditions));
        foreach (var condition in conditions) if (condition == null) throw new ArgumentException("A condition group cannot hold null.", nameof(conditions));
        return new CanopyFlowCondition(group, (CanopyFlowCondition[])conditions.Clone());
    }

    /// <summary>A predicate with checked values; throws <see cref="InvalidOperationException"/> when they do not fit the operator.</summary>
    private static CanopyFlowCondition Create(string field, CanopyFlowOperator op, IList<object?> raw) {
        var values = new object[raw.Count];
        for (var index = 0; index < raw.Count; index++) {
            if (!CanopyFlowValues.TryScalar(raw[index], out values[index])) throw new InvalidOperationException("Condition values are text, finite numbers within the safe integer magnitude, or true or false.");
            if (values[index] is string text && text.Length > CanopyFlowValues.MaxConditionText) throw new InvalidOperationException("A condition value has at most 4096 characters.");
        }

        var count = values.Length;
        switch (op) {
            case CanopyFlowOperator.IsEmpty:
            case CanopyFlowOperator.IsNotEmpty:
                if (count != 0) throw new InvalidOperationException("isNull and isNotNull take no values.");
                break;
            case CanopyFlowOperator.In:
            case CanopyFlowOperator.NotIn:
                if (count < 1 || count > MaxValues) throw new InvalidOperationException("in and notIn take 1 to 1000 values.");
                break;
            case CanopyFlowOperator.Between:
                if (count != 2) throw new InvalidOperationException("between takes two values, lower first.");
                if (!(values[0] is double && values[1] is double || values[0] is string && values[1] is string)) throw new InvalidOperationException("between takes two numbers or two texts.");
                if (Compare(values[0], values[1]) > 0) throw new InvalidOperationException("between takes the lower value first.");
                break;
            default:
                if (count != 1) throw new InvalidOperationException(Wire(op) + " takes one value.");
                if ((op == CanopyFlowOperator.StartsWith || op == CanopyFlowOperator.EndsWith || op == CanopyFlowOperator.Matches || op == CanopyFlowOperator.NotMatches) && !(values[0] is string))
                    throw new InvalidOperationException(Wire(op) + " takes text.");
                if ((op == CanopyFlowOperator.GreaterThan || op == CanopyFlowOperator.GreaterOrEqual || op == CanopyFlowOperator.LessThan || op == CanopyFlowOperator.LessOrEqual) && values[0] is bool)
                    throw new InvalidOperationException(Wire(op) + " takes a number or text.");
                break;
        }

        var condition = new CanopyFlowCondition(field, op, values);
        if (op == CanopyFlowOperator.Matches || op == CanopyFlowOperator.NotMatches) condition._pattern = CompilePattern((string)values[0]);
        return condition;
    }

    private static CanopyNativePattern CompilePattern(string source) {
        try {
            return new CanopyNativePattern(CanopyPattern.CompileNative(source, false), false);
        } catch (ArgumentException error) {
            throw new InvalidOperationException("Invalid pattern '" + source + "'.", error);
        }
    }

    /// <summary>Checks the bounds: eight levels, 64 groups (a predicate on its own counts as one) and 64 predicates.</summary>
    internal void Validate() {
        var groups = IsGroup ? 0 : 1;
        var predicates = 0;
        Count(this, IsGroup ? 1 : 2, ref groups, ref predicates);
    }

    private static void Count(CanopyFlowCondition condition, int level, ref int groups, ref int predicates) {
        if (!condition.IsGroup) {
            if (++predicates > MaxPredicates) throw new InvalidOperationException("A condition holds at most 64 predicates.");
            return;
        }

        if (level > MaxLevels) throw new InvalidOperationException("A condition holds at most eight levels.");
        if (++groups > MaxGroups) throw new InvalidOperationException("A condition holds at most 64 groups.");
        foreach (var child in condition.Conditions) Count(child, level + 1, ref groups, ref predicates);
    }

    /// <summary>The field ids the condition reads.</summary>
    internal IEnumerable<string> Fields() {
        if (!IsGroup) return new[] { Field! };
        return Conditions.SelectMany(condition => condition.Fields());
    }

    /// <summary>Evaluates over a reader that returns each field's answer in its generic form (<see cref="CanopyFlowValues.Generic"/>).</summary>
    internal bool EvaluateWith(Func<string, object?> read) {
        if (IsGroup) {
            switch (GroupOperator) {
                case CanopyFlowGroupOperator.Any:
                    foreach (var condition in Conditions) if (condition.EvaluateWith(read)) return true;
                    return false;
                case CanopyFlowGroupOperator.None:
                    foreach (var condition in Conditions) if (condition.EvaluateWith(read)) return false;
                    return true;
                default:
                    foreach (var condition in Conditions) if (!condition.EvaluateWith(read)) return false;
                    return true;
            }
        }

        var value = read(Field!);
        if (IsBlank(value)) return Operator == CanopyFlowOperator.IsEmpty;
        if (value is List<object?> items) {
            switch (Operator) {
                case CanopyFlowOperator.IsNotEmpty: return true;
                case CanopyFlowOperator.Contains: return AnyItem(items, Values[0]);
                case CanopyFlowOperator.NotContains: return !AnyItem(items, Values[0]);
                case CanopyFlowOperator.In: return AnyListed(items);
                case CanopyFlowOperator.NotIn: return !AnyListed(items);
                default: return false;
            }
        }

        var operand = Values.Count > 0 ? Values[0] : null;
        switch (Operator) {
            case CanopyFlowOperator.IsNotEmpty: return true;
            case CanopyFlowOperator.Equal: return Same(value!, operand!);
            case CanopyFlowOperator.NotEqual: return !Same(value!, operand!);
            case CanopyFlowOperator.In: return Listed(value!);
            case CanopyFlowOperator.NotIn: return !Listed(value!);
            case CanopyFlowOperator.GreaterThan: return Ordered(value!, operand!, out var gt) && gt > 0;
            case CanopyFlowOperator.GreaterOrEqual: return Ordered(value!, operand!, out var ge) && ge >= 0;
            case CanopyFlowOperator.LessThan: return Ordered(value!, operand!, out var lt) && lt < 0;
            case CanopyFlowOperator.LessOrEqual: return Ordered(value!, operand!, out var le) && le <= 0;
            case CanopyFlowOperator.Between: return Ordered(value!, operand!, out var low) && low >= 0 && Ordered(value!, Values[1], out var high) && high <= 0;
            case CanopyFlowOperator.Contains: return value is string a && operand is string b && Fold(a).IndexOf(Fold(b), StringComparison.Ordinal) >= 0;
            case CanopyFlowOperator.NotContains: return value is string c && operand is string d && Fold(c).IndexOf(Fold(d), StringComparison.Ordinal) < 0;
            case CanopyFlowOperator.StartsWith: return value is string e && operand is string prefix && Fold(e).StartsWith(Fold(prefix), StringComparison.Ordinal);
            case CanopyFlowOperator.EndsWith: return value is string g && operand is string suffix && Fold(g).EndsWith(Fold(suffix), StringComparison.Ordinal);
            case CanopyFlowOperator.Matches: return value is string subject && Pattern().IsMatch(Window(subject));
            case CanopyFlowOperator.NotMatches: return value is string other && !Pattern().IsMatch(Window(other));
            default: return false;
        }
    }

    /// <summary>Whether a value is empty: missing, null, empty text or an array without items.</summary>
    private static bool IsBlank(object? value) => value == null || value is string text && text.Length == 0 || value is List<object?> list && list.Count == 0;

    /// <summary>Patterns test the first 4,096 UTF-16 code units of the text.</summary>
    private static string Window(string text) => text.Length > CanopyFlowValues.MaxConditionText ? text.Substring(0, CanopyFlowValues.MaxConditionText) : text;

    private static string Fold(string text) => CanopyTextFolding.Fold(text)!;

    private CanopyNativePattern Pattern() => _pattern ??= CompilePattern((string)Values[0]);

    private static bool AnyItem(List<object?> items, object operand) {
        foreach (var item in items) if (item != null && !(item is List<object?>) && Same(item, operand)) return true;
        return false;
    }

    private bool AnyListed(List<object?> items) {
        foreach (var item in items) if (item != null && !(item is List<object?>) && Listed(item)) return true;
        return false;
    }

    private bool Listed(object value) {
        foreach (var candidate in Values) if (Same(value, candidate)) return true;
        return false;
    }

    private static bool Same(object value, object operand) => value switch {
        string text => operand is string other && string.Equals(CanopyTextFolding.Fold(text), CanopyTextFolding.Fold(other), StringComparison.Ordinal),
        double number => operand is double other && number == other,
        bool flag => operand is bool other && flag == other,
        _ => false
    };

    /// <summary>Orders two values of one type: numbers numerically, text by folded UTF-16 code units; false for other pairs.</summary>
    private static bool Ordered(object value, object operand, out int order) {
        order = 0;
        if (value is double number && operand is double other) {
            order = number.CompareTo(other);
            return true;
        }

        if (value is string text && operand is string word) {
            order = Compare(text, word);
            return true;
        }

        return false;
    }

    private static int Compare(object a, object b) => a is double x && b is double y ? x.CompareTo(y) :
        Math.Sign(string.CompareOrdinal(CanopyTextFolding.Fold((string)a), CanopyTextFolding.Fold((string)b)));

    internal void WriteJson(CanopyJsonWriter writer) {
        if (!IsGroup) {
            writer.BeginObject().Property("operator", "and").Name("filters").BeginArray();
            WritePredicate(writer);
            writer.EndArray().EndObject();
            return;
        }

        writer.BeginObject().Property("operator", GroupOperator == CanopyFlowGroupOperator.Any ? "or" : GroupOperator == CanopyFlowGroupOperator.None ? "none" : "and");
        if (Conditions.Any(condition => !condition.IsGroup)) {
            writer.Name("filters").BeginArray();
            foreach (var condition in Conditions) if (!condition.IsGroup) condition.WritePredicate(writer);
            writer.EndArray();
        }

        if (Conditions.Any(condition => condition.IsGroup)) {
            writer.Name("groups").BeginArray();
            foreach (var condition in Conditions) if (condition.IsGroup) condition.WriteJson(writer);
            writer.EndArray();
        }

        writer.EndObject();
    }

    private void WritePredicate(CanopyJsonWriter writer) {
        writer.BeginObject().Property("field", Field).Property("operator", Wire(Operator));
        if (Values.Count > 0) {
            writer.Name("values").BeginArray();
            foreach (var value in Values) CanopyFlowValues.Write(writer, value);
            writer.EndArray();
        }

        writer.EndObject();
    }

    /// <summary>Reads a condition group from parsed contract JSON.</summary>
    internal static CanopyFlowCondition Read(object? node, string what, int level = 1) {
        if (level > MaxLevels) throw new InvalidOperationException(what + " is deeper than eight levels.");
        var map = CanopyFlowContract.Object(node, what, "operator", "filters", "groups");
        var op = CanopyFlowContract.Text(map, "operator", what) switch {
            "and" => CanopyFlowGroupOperator.All,
            "or" => CanopyFlowGroupOperator.Any,
            "none" => CanopyFlowGroupOperator.None,
            _ => throw new InvalidOperationException(what + " has an unknown group operator.")
        };
        var children = new List<CanopyFlowCondition>();
        foreach (var item in CanopyFlowContract.Items(map, "filters", what, MaxPredicates)) {
            var predicate = CanopyFlowContract.Object(item, what + " (filter)", "field", "operator", "values");
            var field = CanopyFlowContract.Text(predicate, "field", what);
            if (!CanopyFlowValues.IsIdentifier(field)) throw new InvalidOperationException(what + " names an invalid field id.");
            var name = CanopyFlowContract.Text(predicate, "operator", what);
            var parsed = Parse(name) ?? throw new InvalidOperationException(what + " has the unknown operator '" + name + "'.");
            var values = CanopyFlowContract.Items(predicate, "values", what, MaxValues);
            children.Add(Create(field!, parsed, values));
        }

        foreach (var item in CanopyFlowContract.Items(map, "groups", what, MaxGroups)) children.Add(Read(item, what, level + 1));
        if (children.Count == 0) throw new InvalidOperationException(what + " needs at least one filter or group.");
        return new CanopyFlowCondition(op, children.ToArray());
    }

    private static CanopyFlowOperator? Parse(string? name) {
        for (var op = CanopyFlowOperator.Equal; op <= CanopyFlowOperator.IsNotEmpty; op++) if (Wire(op) == name) return op;
        return null;
    }

    internal static string Wire(CanopyFlowOperator op) => op switch {
        CanopyFlowOperator.Equal => "eq",
        CanopyFlowOperator.NotEqual => "ne",
        CanopyFlowOperator.GreaterThan => "gt",
        CanopyFlowOperator.GreaterOrEqual => "ge",
        CanopyFlowOperator.LessThan => "lt",
        CanopyFlowOperator.LessOrEqual => "le",
        CanopyFlowOperator.Contains => "contains",
        CanopyFlowOperator.NotContains => "notContains",
        CanopyFlowOperator.StartsWith => "startsWith",
        CanopyFlowOperator.EndsWith => "endsWith",
        CanopyFlowOperator.Matches => "matches",
        CanopyFlowOperator.NotMatches => "notMatches",
        CanopyFlowOperator.In => "in",
        CanopyFlowOperator.NotIn => "notIn",
        CanopyFlowOperator.Between => "between",
        CanopyFlowOperator.IsEmpty => "isNull",
        CanopyFlowOperator.IsNotEmpty => "isNotNull",
        _ => throw new ArgumentOutOfRangeException(nameof(op), op, "Unknown condition operator.")
    };
}
