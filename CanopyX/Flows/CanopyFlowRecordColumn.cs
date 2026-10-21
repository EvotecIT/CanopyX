using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A column of a records field (<see cref="CanopyFlowField.Columns"/>): a typed cell per row, edited with the same editor and checks
/// as a grid cell of that type.
/// </summary>
public sealed class CanopyFlowRecordColumn {
    private int? _width;

    /// <summary>Creates a column.</summary>
    /// <param name="id">The id, unique in the field, which keys the cell in each row: a letter, then up to 63 letters, digits, hyphens and underscores.</param>
    /// <param name="title">The header: plain text of at most 200 characters.</param>
    /// <param name="kind">The cell type.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlowRecordColumn(string id, string title, CanopyFlowRecordColumnKind kind = CanopyFlowRecordColumnKind.Text) {
        Id = CanopyFlowValues.RequireIdentifier(id, nameof(id), "A column id");
        Title = title;
        Kind = kind;
    }

    /// <summary>Gets the column's id.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the header. Plain text of at most 200 characters.</summary>
    public string Title { get; set; }

    /// <summary>Gets or sets the cell type.</summary>
    public CanopyFlowRecordColumnKind Kind { get; set; }

    /// <summary>Gets or sets whether an empty cell is an error (<see cref="CanopyCellValidation.Required"/> of <see cref="Validation"/>).</summary>
    public bool IsRequired {
        get => Validation.Required;
        set => Validation.Required = value;
    }

    /// <summary>Gets the cell's checks: a range for number columns, lengths and a pattern for text columns, and one message.</summary>
    public CanopyCellValidation Validation { get; } = new CanopyCellValidation();

    /// <summary>Gets the options of a select column (1 to 1,000).</summary>
    public IList<CanopyFlowOption> Options { get; } = new List<CanopyFlowOption>();

    /// <summary>Gets or sets the column's width in pixels, 60 to 480; null fits the editor.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The width is outside 60 to 480.</exception>
    public int? Width {
        get => _width;
        set => _width = value < 60 || value > 480 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A column is 60 to 480 pixels wide.") : value;
    }

    /// <summary>Makes an empty cell an error.</summary>
    /// <returns>The column.</returns>
    public CanopyFlowRecordColumn Required() { IsRequired = true; return this; }

    /// <summary>Adds an option of a select column.</summary>
    /// <param name="value">The value: text, a number or true or false.</param>
    /// <param name="label">The text the reader sees, or null to show the value.</param>
    /// <returns>The column.</returns>
    public CanopyFlowRecordColumn Option(object value, string? label = null) { Options.Add(new CanopyFlowOption(value, label)); return this; }

    private static readonly (string Wire, CanopyFlowRecordColumnKind Value)[] KindNames = {
        ("text", CanopyFlowRecordColumnKind.Text), ("number", CanopyFlowRecordColumnKind.Number), ("date", CanopyFlowRecordColumnKind.Date),
        ("time", CanopyFlowRecordColumnKind.Time), ("select", CanopyFlowRecordColumnKind.Select), ("toggle", CanopyFlowRecordColumnKind.Toggle)
    };

    /// <summary>The flow field kind whose value rules a cell of this column follows.</summary>
    internal CanopyFlowFieldKind FieldKind => Kind switch {
        CanopyFlowRecordColumnKind.Number => CanopyFlowFieldKind.Number,
        CanopyFlowRecordColumnKind.Date => CanopyFlowFieldKind.Date,
        CanopyFlowRecordColumnKind.Time => CanopyFlowFieldKind.Time,
        CanopyFlowRecordColumnKind.Select => CanopyFlowFieldKind.Select,
        CanopyFlowRecordColumnKind.Toggle => CanopyFlowFieldKind.Toggle,
        _ => CanopyFlowFieldKind.Text
    };

    /// <summary>A stand-in field for the value rules of one cell (CanopyFlowValues and the submission's checks).</summary>
    internal CanopyFlowField CellField() {
        var field = new CanopyFlowField(Id, FieldKind, Title);
        foreach (var option in Options) field.Options.Add(option);
        field.Validation.Required = Validation.Required;
        field.Validation.Minimum = Validation.Minimum; field.Validation.Maximum = Validation.Maximum;
        field.Validation.MinLength = Validation.MinLength; field.Validation.MaxLength = Validation.MaxLength;
        field.Validation.Pattern = Validation.Pattern; field.Validation.Message = Validation.Message;
        return field;
    }

    internal void Validate(string field) {
        var what = "Column " + Id + " of field " + field;
        CanopyFlowValues.CheckShort(Title, what + " (title)", required: true);
        if (!Enum.IsDefined(typeof(CanopyFlowRecordColumnKind), Kind)) throw new InvalidOperationException(what + " has an unknown type.");
        if (Validation.Earliest.HasValue || Validation.Latest.HasValue) throw new InvalidOperationException(what + ": records columns have no date-and-time range.");
        Validation.Validate(FieldKind, field + "." + Id);
        if ((Kind == CanopyFlowRecordColumnKind.Select) != (Options.Count > 0)) throw new InvalidOperationException(what + ": a select column needs options, and only a select column has them.");
        if (Options.Count > CanopyFlowValues.MaxOptions) throw new InvalidOperationException(what + " has more than 1000 options.");
        for (var index = 0; index < Options.Count; index++) {
            var option = Options[index] ?? throw new InvalidOperationException(what + " has a null option.");
            option.Validate(field + "." + Id);
            for (var earlier = 0; earlier < index; earlier++) if (CanopyFlowValues.SameScalar(Options[earlier].Value, option.Value)) throw new InvalidOperationException(what + " has two options with the same value.");
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("title", Title);
        if (Kind != CanopyFlowRecordColumnKind.Text) writer.Property("type", KindNames[(int)Kind].Wire);
        if (IsRequired) writer.Property("required", true);
        writer.OptionalProperty("width", Width);
        if (Options.Count > 0) {
            writer.Name("options").BeginArray();
            foreach (var option in Options) option.WriteJson(writer);
            writer.EndArray();
        }

        var rules = Validation;
        if (rules.Minimum.HasValue || rules.Maximum.HasValue || rules.MinLength.HasValue || rules.MaxLength.HasValue || rules.Pattern != null || rules.Message != null) {
            writer.Name("validation").BeginObject();
            if (rules.Minimum.HasValue) writer.Name("min").Number(rules.Minimum.Value);
            if (rules.Maximum.HasValue) writer.Name("max").Number(rules.Maximum.Value);
            writer.OptionalProperty("minLength", rules.MinLength).OptionalProperty("maxLength", rules.MaxLength).OptionalProperty("pattern", rules.Pattern).OptionalProperty("message", rules.Message);
            writer.EndObject();
        }

        writer.EndObject();
    }

    internal static CanopyFlowRecordColumn Read(object? node, string what) {
        var map = CanopyFlowContract.Object(node, what + " (column)", "id", "title", "type", "required", "options", "validation", "width");
        var id = CanopyFlowContract.RequiredText(map, "id", what);
        if (!CanopyFlowValues.IsIdentifier(id)) throw new InvalidOperationException(what + " has a column with an invalid id.");
        var type = CanopyFlowContract.Text(map, "type", what);
        var column = new CanopyFlowRecordColumn(id, CanopyFlowContract.RequiredText(map, "title", what), type == null ? CanopyFlowRecordColumnKind.Text : CanopyFlowContract.Choose(type, what, "type", KindNames)) {
            IsRequired = CanopyFlowContract.Boolean(map, "required", what) ?? false
        };
        try {
            column.Width = CanopyFlowContract.Integer(map, "width", what);
        } catch (ArgumentException error) {
            throw new InvalidOperationException(what + ": " + error.Message, error);
        }

        foreach (var item in CanopyFlowContract.Items(map, "options", what, CanopyFlowValues.MaxOptions)) column.Options.Add(CanopyFlowField.ReadOption(item, what));
        if (map.TryGetValue("validation", out var validation)) {
            var rules = CanopyFlowContract.Object(validation, what + " (column validation)", "min", "max", "minLength", "maxLength", "pattern", "message");
            try {
                column.Validation.Minimum = CanopyFlowContract.Number(rules, "min", what);
                column.Validation.Maximum = CanopyFlowContract.Number(rules, "max", what);
                column.Validation.MinLength = CanopyFlowContract.Integer(rules, "minLength", what);
                column.Validation.MaxLength = CanopyFlowContract.Integer(rules, "maxLength", what);
            } catch (ArgumentException error) {
                throw new InvalidOperationException(what + ": " + error.Message, error);
            }

            column.Validation.Pattern = CanopyFlowContract.Text(rules, "pattern", what);
            column.Validation.Message = CanopyFlowContract.Text(rules, "message", what);
        }

        return column;
    }
}