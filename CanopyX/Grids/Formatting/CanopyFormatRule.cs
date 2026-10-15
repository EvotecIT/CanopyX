using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A conditional formatting rule of a flat grid: an identity, a condition (<see cref="When"/>; none matches every row), a
/// target (the rule's column, the whole row, or named columns) and a <see cref="Style"/>.
/// </summary>
/// <remarks>
/// <para>
/// Rules apply in order. For each target cell or row the first matched rule that sets an aspect (tone, icon, badge, cue,
/// bar, scale) wins it; every matched rule adds its description; <see cref="StopIfTrue"/> ends a row's rules. The
/// browser evaluates rules on the rows it has, including the rows a host grid receives, and the static renderer
/// evaluates them for script-free output. Rules never change data, filtering, sorting, selection or CSV.
/// </para>
/// <para>The JSON form is the <c>formatRules</c> entry of the <c>canopyx/2</c> grid document; the browser editor writes the same schema.</para>
/// </remarks>
public sealed class CanopyFormatRule {
    private string? _label;
    private string? _description;
    private string? _column;

    /// <summary>Creates a rule.</summary>
    /// <param name="id">A unique identifier: a letter or digit, then up to 63 letters, digits, <c>_</c>, <c>.</c>, <c>:</c> and <c>-</c>.</param>
    /// <param name="style">How the rule paints.</param>
    /// <exception cref="ArgumentException">The identifier is not valid.</exception>
    public CanopyFormatRule(string id, CanopyFormatStyle style) {
        if (!IsId(id)) throw new ArgumentException("A rule identifier is a letter or digit followed by up to 63 letters, digits, '_', '.', ':' and '-'.", nameof(id));
        Id = id;
        Style = style ?? throw new ArgumentNullException(nameof(style));
    }

    /// <summary>Gets the rule's identifier, unique within the grid.</summary>
    public string Id { get; }

    /// <summary>Gets the rule's style.</summary>
    public CanopyFormatStyle Style { get; }

    /// <summary>Gets or sets the rule's name: its legend entry and default description (at most 200 characters).</summary>
    public string? Label { get => _label; set { CanopyFormatStyle.ValidateText(value, 200, nameof(value)); _label = value; } }

    /// <summary>Gets or sets what screen readers hear on a formatted cell (at most 1,000 characters). Null uses the label.</summary>
    public string? Description { get => _description; set { CanopyFormatStyle.ValidateText(value, 1000, nameof(value)); _description = value; } }

    /// <summary>Gets or sets whether the rule applies. Defaults to true.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Gets or sets the condition, or null to match every row (the usual choice for bars and scales).</summary>
    public CanopyFormatCondition? When { get; set; }

    /// <summary>Gets or sets the rule's column: the cell a <see cref="CanopyFormatTarget.Cell"/> rule paints and the value a bar, scale or band reads.</summary>
    public string? Column { get => _column; set { CanopyIdentifiers.Require(value, nameof(value), allowNull: true); _column = value; } }

    /// <summary>Gets or sets what the rule paints. Defaults to the cell of <see cref="Column"/>.</summary>
    public CanopyFormatTarget Target { get; set; }

    /// <summary>Gets the columns a <see cref="CanopyFormatTarget.Columns"/> rule paints.</summary>
    public IList<string> Columns { get; } = new List<string>();

    /// <summary>Gets or sets whether the formatting follows the column into the record drawer and the phone's hidden fields. Defaults to true.</summary>
    public bool Details { get; set; } = true;

    /// <summary>Gets or sets whether a match ends the evaluation of the rules after this one for that row.</summary>
    public bool StopIfTrue { get; set; }

    /// <summary>Returns a rule that paints a column's cell.</summary>
    /// <param name="id">The rule's identifier.</param>
    /// <param name="column">The column.</param>
    /// <param name="style">The style.</param>
    /// <param name="when">The condition, or null for every row.</param>
    /// <returns>The rule.</returns>
    public static CanopyFormatRule ForCell(string id, string column, CanopyFormatStyle style, CanopyFormatCondition? when = null) =>
        new CanopyFormatRule(id, style) { Column = column, When = when };

    /// <summary>Returns a rule that paints whole rows.</summary>
    /// <param name="id">The rule's identifier.</param>
    /// <param name="style">The style.</param>
    /// <param name="when">The condition.</param>
    /// <returns>The rule.</returns>
    public static CanopyFormatRule ForRow(string id, CanopyFormatStyle style, CanopyFormatCondition when) =>
        new CanopyFormatRule(id, style) { Target = CanopyFormatTarget.Row, When = when ?? throw new ArgumentNullException(nameof(when)) };

    internal static bool IsId(string? id) {
        if (string.IsNullOrEmpty(id) || id!.Length > 64 || !char.IsLetterOrDigit(id[0]) || id[0] > 'z') return false;
        foreach (var ch in id) if (!(ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || ch == '_' || ch == '.' || ch == ':' || ch == '-')) return false;
        return true;
    }

    internal void Validate(IDictionary<string, CanopyColumn> columns) {
        if (!Enum.IsDefined(typeof(CanopyFormatTarget), Target)) throw new ArgumentOutOfRangeException(nameof(Target));
        if (Column != null && !columns.ContainsKey(Column) || Target == CanopyFormatTarget.Cell && Column == null)
            throw new InvalidOperationException("Formatting rule '" + Id + "' needs a declared column for its target.");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        if (Target == CanopyFormatTarget.Columns ? Columns.Count == 0 || Columns.Count > 64 : Columns.Count != 0)
            throw new InvalidOperationException("Formatting rule '" + Id + "' names columns only for the Columns target, 1 to 64 of them.");
        foreach (var id in Columns) {
            if (id == null || !columns.ContainsKey(id) || !seen.Add(id)) throw new InvalidOperationException("Formatting rule '" + Id + "' names declared columns once each.");
        }
        Style.Validate(Target == CanopyFormatTarget.Row, Column != null);
        if (When != null) {
            int predicates = 0, groups = 0;
            When.Validate(columns, 1, ref predicates, ref groups);
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).OptionalProperty("label", Label).OptionalProperty("description", Description);
        if (!Enabled) writer.Property("enabled", false);
        if (When != null) { writer.Name("when"); When.WriteJson(writer); }
        writer.OptionalProperty("column", Column);
        if (Target != CanopyFormatTarget.Cell) writer.Property("target", CanopyFormatNames.Wire(Target));
        if (Columns.Count > 0) writer.StringArray("columns", Columns);
        if (!Details) writer.Property("details", false);
        writer.Name("style"); Style.WriteJson(writer);
        if (StopIfTrue) writer.Property("stopIfTrue", true);
        writer.EndObject();
    }
}
