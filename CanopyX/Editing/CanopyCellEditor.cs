using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The typed editor of an editable flat-grid column (<see cref="CanopyColumn.Editor"/>): text, number, date, date and time,
/// time, select, toggle, lookup, or an editor a browser plugin registers. Without one, an editable column uses the editor of
/// its kind (text, number, or date and time).
/// </summary>
/// <remarks>
/// The browser's editing part builds the editor; the view document carries the definition as the column's <c>editor</c>
/// object. Dates and times are shown and entered in the grid's time zone (<see cref="CanopyDataGridView.TimeZone"/>) and
/// stored as ISO 8601 UTC. Number editors read numbers as the page language writes them. See docs/editing.md.
/// </remarks>
public sealed class CanopyCellEditor {
    private double? _step;
    private int? _lookupLimit;
    private int? _lookupMinLength;

    private CanopyCellEditor(CanopyCellEditorKind kind, string? name = null) {
        Kind = kind;
        Name = name;
    }

    /// <summary>Gets the editor kind.</summary>
    public CanopyCellEditorKind Kind { get; }

    /// <summary>Gets the name a browser plugin registers the editor under, for <see cref="CanopyCellEditorKind.Custom"/>; otherwise null.</summary>
    public string? Name { get; }

    /// <summary>Gets or sets the smallest number a number editor accepts and steps to. A <see cref="CanopyCellValidation.Minimum"/> takes precedence.</summary>
    public double? Minimum { get; set; }

    /// <summary>Gets or sets the largest number a number editor accepts and steps to. A <see cref="CanopyCellValidation.Maximum"/> takes precedence.</summary>
    public double? Maximum { get; set; }

    /// <summary>Gets or sets the step of a number editor: Up and Down move by it, and values must be a multiple of it from the minimum (or zero).</summary>
    /// <exception cref="ArgumentOutOfRangeException">The step is not a positive finite number.</exception>
    public double? Step {
        get => _step;
        set => _step = value.HasValue && (double.IsNaN(value.Value) || double.IsInfinity(value.Value) || value.Value <= 0)
            ? throw new ArgumentOutOfRangeException(nameof(value), value, "A step must be a positive finite number.") : value;
    }

    /// <summary>Gets or sets the hint an empty text, number or lookup editor shows, drawn fainter and in italics so it never reads as a value.</summary>
    public string? Placeholder { get; set; }

    /// <summary>Gets the choices of a select editor, or the fixed suggestions of a lookup editor (at most 1,000).</summary>
    public IList<CanopyEditorOption> Options { get; } = new List<CanopyEditorOption>();

    /// <summary>Gets or sets the column whose values a lookup suggests through the data source; null uses the edited column.</summary>
    public string? LookupColumn { get; set; }

    /// <summary>Gets or sets how many suggestions a lookup shows, from 1 to 50. Null uses 20.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The limit is outside 1 to 50.</exception>
    public int? LookupLimit {
        get => _lookupLimit;
        set => _lookupLimit = value < 1 || value > 50 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A lookup shows 1 to 50 suggestions.") : value;
    }

    /// <summary>Gets or sets how many characters a reader types before a lookup searches, from 0 to 16. Null uses 1.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The length is outside 0 to 16.</exception>
    public int? LookupMinLength {
        get => _lookupMinLength;
        set => _lookupMinLength = value < 0 || value > 16 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A lookup starts after 0 to 16 characters.") : value;
    }

    /// <summary>Creates a text editor.</summary>
    /// <returns>The editor.</returns>
    public static CanopyCellEditor Text() => new CanopyCellEditor(CanopyCellEditorKind.Text);

    /// <summary>Creates a number editor.</summary>
    /// <param name="minimum">The smallest number it accepts, or null.</param>
    /// <param name="maximum">The largest number it accepts, or null.</param>
    /// <param name="step">The step of Up and Down, and the multiple values must keep, or null.</param>
    /// <returns>The editor.</returns>
    public static CanopyCellEditor Number(double? minimum = null, double? maximum = null, double? step = null) =>
        new CanopyCellEditor(CanopyCellEditorKind.Number) { Minimum = minimum, Maximum = maximum, Step = step };

    /// <summary>Creates a date editor.</summary>
    /// <returns>The editor.</returns>
    public static CanopyCellEditor Date() => new CanopyCellEditor(CanopyCellEditorKind.Date);

    /// <summary>Creates a date and time editor.</summary>
    /// <returns>The editor.</returns>
    public static CanopyCellEditor DateTime() => new CanopyCellEditor(CanopyCellEditorKind.DateTime);

    /// <summary>Creates a time editor.</summary>
    /// <returns>The editor.</returns>
    public static CanopyCellEditor Time() => new CanopyCellEditor(CanopyCellEditorKind.Time);

    /// <summary>Creates a select editor with fixed choices.</summary>
    /// <param name="options">The choices, in order.</param>
    /// <returns>The editor.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="options"/> is null.</exception>
    public static CanopyCellEditor Select(IEnumerable<CanopyEditorOption> options) {
        var editor = new CanopyCellEditor(CanopyCellEditorKind.Select);
        foreach (var option in options ?? throw new ArgumentNullException(nameof(options))) editor.Options.Add(option);
        return editor;
    }

    /// <summary>Creates a select editor whose choices are text values, shown as they are.</summary>
    /// <param name="values">The values, in order.</param>
    /// <returns>The editor.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="values"/> is null.</exception>
    public static CanopyCellEditor Select(params string[] values) {
        var editor = new CanopyCellEditor(CanopyCellEditorKind.Select);
        foreach (var value in values ?? throw new ArgumentNullException(nameof(values))) editor.Options.Add(new CanopyEditorOption(value));
        return editor;
    }

    /// <summary>Creates a toggle for true and false values.</summary>
    /// <returns>The editor.</returns>
    public static CanopyCellEditor Toggle() => new CanopyCellEditor(CanopyCellEditorKind.Toggle);

    /// <summary>Creates a lookup that suggests values as the reader types.</summary>
    /// <param name="column">The column whose values it suggests through the data source; null uses the edited column.</param>
    /// <returns>The editor.</returns>
    /// <remarks>Fixed <see cref="Options"/> take the place of the column's values; a browser host can supply its own search with <c>editing.lookups</c>.</remarks>
    public static CanopyCellEditor Lookup(string? column = null) => new CanopyCellEditor(CanopyCellEditorKind.Lookup) { LookupColumn = column };

    /// <summary>Creates a reference to an editor a browser plugin (<c>editors</c> in docs/plugins.md) or the host registers.</summary>
    /// <param name="name">The registered name: 1 to 64 ASCII letters, digits, hyphens or underscores, starting with a letter.</param>
    /// <returns>The editor.</returns>
    /// <exception cref="ArgumentException">The name is not valid.</exception>
    public static CanopyCellEditor Custom(string name) {
        if (!IsName(name)) throw new ArgumentException("An editor name is 1 to 64 ASCII letters, digits, hyphens or underscores starting with a letter.", nameof(name));
        return new CanopyCellEditor(CanopyCellEditorKind.Custom, name);
    }

    private static bool IsName(string? value) {
        if (value == null || value.Length == 0 || value.Length > 64 || !(value[0] >= 'a' && value[0] <= 'z' || value[0] >= 'A' && value[0] <= 'Z')) return false;
        foreach (var ch in value) if (!(ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || ch == '-' || ch == '_')) return false;
        return true;
    }

    internal string WireType => Kind switch {
        CanopyCellEditorKind.Text => "text",
        CanopyCellEditorKind.Number => "number",
        CanopyCellEditorKind.Date => "date",
        CanopyCellEditorKind.DateTime => "datetime",
        CanopyCellEditorKind.Time => "time",
        CanopyCellEditorKind.Select => "select",
        CanopyCellEditorKind.Toggle => "toggle",
        CanopyCellEditorKind.Lookup => "lookup",
        _ => Name!
    };

    internal void Validate(CanopyColumn column, IEnumerable<CanopyColumn> columns) {
        var kind = column.Kind;
        var fits = Kind switch {
            CanopyCellEditorKind.Number => kind == CanopyColumnKind.Number,
            CanopyCellEditorKind.Date or CanopyCellEditorKind.DateTime or CanopyCellEditorKind.Time => kind != CanopyColumnKind.Number,
            CanopyCellEditorKind.Text or CanopyCellEditorKind.Toggle => kind == CanopyColumnKind.Text,
            CanopyCellEditorKind.Select or CanopyCellEditorKind.Lookup or CanopyCellEditorKind.Custom => true,
            _ => false
        };
        if (!fits) throw new InvalidOperationException("Column " + column.Id + " cannot use a " + WireType + " editor for its kind.");
        if (Kind != CanopyCellEditorKind.Number && (Minimum.HasValue || Maximum.HasValue || Step.HasValue))
            throw new InvalidOperationException("Only number editors take a minimum, maximum or step.");
        if (Minimum.HasValue && Maximum.HasValue && Minimum.Value > Maximum.Value) throw new InvalidOperationException("An editor's minimum cannot exceed its maximum.");
        foreach (var bound in new[] { Minimum, Maximum }) {
            if (bound.HasValue && (double.IsNaN(bound.Value) || double.IsInfinity(bound.Value) || Math.Abs(bound.Value) > 9007199254740991d))
                throw new InvalidOperationException("Editor limits must be finite and within the safe integer magnitude.");
        }
        if (Kind == CanopyCellEditorKind.Select && Options.Count == 0) throw new InvalidOperationException("A select editor needs options.");
        if (Options.Count > 1000) throw new InvalidOperationException("An editor offers at most 1000 options.");
        foreach (var option in Options) {
            if (option == null || !option.Fits(kind)) throw new InvalidOperationException("Editor options of column " + column.Id + " must hold values of its kind.");
        }
        if (Kind != CanopyCellEditorKind.Lookup && (LookupColumn != null || LookupLimit.HasValue || LookupMinLength.HasValue))
            throw new InvalidOperationException("Only lookup editors take lookup settings.");
        if (LookupColumn != null) {
            var found = false;
            foreach (var item in columns) found |= item != null && item.Id == LookupColumn;
            if (!found) throw new InvalidOperationException("A lookup column must be a declared column.");
        }
        if (Placeholder != null && Placeholder.Length > 256) throw new InvalidOperationException("An editor placeholder is at most 256 characters.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("type", WireType);
        if (Minimum.HasValue) writer.Name("min").Number(Minimum.Value);
        if (Maximum.HasValue) writer.Name("max").Number(Maximum.Value);
        if (Step.HasValue) writer.Name("step").Number(Step.Value);
        writer.OptionalProperty("placeholder", Placeholder);
        if (Options.Count > 0) {
            writer.Name("options").BeginArray();
            foreach (var option in Options) option.WriteJson(writer);
            writer.EndArray();
        }
        if (LookupColumn != null || LookupLimit.HasValue || LookupMinLength.HasValue) {
            writer.Name("lookup").BeginObject().OptionalProperty("column", LookupColumn).OptionalProperty("limit", LookupLimit)
                .OptionalProperty("minLength", LookupMinLength).EndObject();
        }
        writer.EndObject();
    }
}
