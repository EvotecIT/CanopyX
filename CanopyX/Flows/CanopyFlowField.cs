using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// A typed field of a flow step or section: its label, help, starting value, condition, layout, the setting it writes, and
/// the checks its answer passes. The browser draws it with the editor of its <see cref="Kind"/> (see "Fields" in docs/flow.md).
/// </summary>
/// <remarks>
/// Each property has a generated fluent method of the same name, so a field reads as a sentence:
/// <c>f =&gt; f.Required().Help("A host name, such as mail.example.com").Path("mail.host")</c>. The flow checks every setting when it is
/// written, and throws <see cref="InvalidOperationException"/> for a setting that does not fit the field's kind.
/// </remarks>
public sealed partial class CanopyFlowField {
    private int? _rowCount;
    private double? _numberStep;
    private int? _ratingScale;
    private int? _minItems;
    private int? _maxItems;

    /// <summary>Creates a field.</summary>
    /// <param name="id">The id, unique in the flow: a letter, then up to 63 letters, digits, hyphens and underscores.</param>
    /// <param name="kind">The field type.</param>
    /// <param name="label">The label: plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlowField(string id, CanopyFlowFieldKind kind, string label) {
        Id = CanopyFlowValues.RequireIdentifier(id, nameof(id), "A field id");
        Kind = kind;
        Label = label;
    }

    /// <summary>Gets the field's id, which keys its answer.</summary>
    public string Id { get; }

    /// <summary>Gets the field's type.</summary>
    public CanopyFlowFieldKind Kind { get; }

    /// <summary>Gets or sets the label. Plain text of at most 200 characters.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets whether an empty answer is an error (<see cref="CanopyCellValidation.Required"/> of <see cref="Validation"/>).</summary>
    public bool IsRequired {
        get => Validation.Required;
        set => Validation.Required = value;
    }

    /// <summary>Gets or sets whether the field is shown and not changed.</summary>
    public bool IsReadOnly { get; set; }

    /// <summary>Gets or sets a line under the label, before the input. Plain text of at most 1,000 characters.</summary>
    public string? Help { get; set; }

    /// <summary>Gets or sets the empty input's hint (text, number, lookup, text area and list fields). At most 256 characters.</summary>
    /// <remarks>
    /// A placeholder is drawn fainter and in italics, and disappears as soon as the user types. Keep it a short hint about the expected format, such as
    /// "For example: name@example.com"; a sample answer the user has to read while typing belongs in <see cref="Help"/>.
    /// </remarks>
    public string? Placeholder { get; set; }

    /// <summary>
    /// Gets or sets the starting value in create mode, of the field's kind: text, a number, true or false, a date
    /// (<see cref="DateTime"/> or <c>yyyy-MM-dd</c>), a time (<see cref="TimeSpan"/> or <c>HH:mm</c>), a moment
    /// (<see cref="DateTimeOffset"/>, <see cref="DateTime"/> or ISO 8601), a duration (<see cref="TimeSpan"/> or ISO 8601), an
    /// option value, or a sequence of option values or texts. Null omits the default. A secret field has none.
    /// </summary>
    public object? Default { get; set; }

    /// <summary>Gets or sets the condition under which the field shows; null always shows it.</summary>
    public CanopyFlowCondition? When { get; set; }

    /// <summary>Gets or sets the field's width on wide forms; <c>Half()</c> lets two half fields share a row.</summary>
    [PowerForge.Fluent.FluentPreset("Half", CanopyFlowFieldWidth.Half)]
    public CanopyFlowFieldWidth Width { get; set; }

    /// <summary>Gets or sets the parameter name in an equivalent command, for hosts that show one: an id-like name.</summary>
    public string? Parameter { get; set; }

    /// <summary>Gets or sets the setting the field writes, as dot-separated names (<c>mail.smtp.host</c>); the proposal's JSON patch uses it.</summary>
    /// <remarks>The host prepares any missing parent objects before applying the patch to its configuration.</remarks>
    public string? Path { get; set; }

    /// <summary>Gets or sets whether a non-secret value stays out of the host's drafts and exports. It still shows on the review page.</summary>
    public bool IsSensitive { get; set; }

    /// <summary>
    /// Gets the checks of the answer: required, a number range (<see cref="CanopyCellValidation.Minimum"/>,
    /// <see cref="CanopyCellValidation.Maximum"/>), a date-and-time range (<see cref="CanopyCellValidation.Earliest"/>,
    /// <see cref="CanopyCellValidation.Latest"/>), text lengths and a pattern (text, text area and secret fields), and one message.
    /// </summary>
    public CanopyCellValidation Validation { get; } = new CanopyCellValidation();

    /// <summary>Gets the options of a select, choice, multiple-choice or lookup field (at most 1,000).</summary>
    [PowerForge.Fluent.NoFluent]
    public IList<CanopyFlowOption> Options { get; } = new List<CanopyFlowOption>();

    /// <summary>Gets or sets how a choice field draws its options; <c>Cards()</c> and <c>AsList()</c> choose one.</summary>
    [PowerForge.Fluent.FluentPreset("Cards", CanopyFlowChoiceDisplay.Cards)]
    [PowerForge.Fluent.FluentPreset("AsList", CanopyFlowChoiceDisplay.List)]
    public CanopyFlowChoiceDisplay Display { get; set; }

    /// <summary>Gets or sets what the review page says for a toggle that is on, for example "Checked". Plain text of at most 60 characters.</summary>
    public string? OnText { get; set; }

    /// <summary>Gets or sets what the review page says for a toggle that is off. Plain text of at most 60 characters.</summary>
    public string? OffText { get; set; }

    /// <summary>Gets or sets the visible rows of a text area, from 2 to 20; null uses 4.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The count is outside 2 to 20.</exception>
    public int? Rows {
        get => _rowCount;
        set => _rowCount = value < 2 || value > 20 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A text area shows 2 to 20 rows.") : value;
    }

    /// <summary>Gets or sets the step of a number field: Up and Down move by it.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The step is not a positive finite number.</exception>
    public double? Step {
        get => _numberStep;
        set => _numberStep = value.HasValue && (double.IsNaN(value.Value) || double.IsInfinity(value.Value) || value.Value <= 0 || value.Value > 9007199254740991d)
            ? throw new ArgumentOutOfRangeException(nameof(value), value, "A step must be a positive finite number.") : value;
    }

    /// <summary>Gets or sets the number of stars a rating field offers, 2 to 10; null offers 5.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The number is outside 2 to 10.</exception>
    public int? Scale {
        get => _ratingScale;
        set => _ratingScale = value < 2 || value > 10 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A rating offers 2 to 10 stars.") : value;
    }

    /// <summary>Gets or sets the shape a text field's answer must have, such as an IP address or a GUID.</summary>
    public CanopyFlowTextFormat Format { get; set; }

    /// <summary>Gets or sets a short hint of a text field's expected shape, such as "AAA-0000", shown under its label. Pair it with
    /// <see cref="Pattern"/> for a custom format; the hint never changes what the reader types.</summary>
    public string? Mask { get; set; }

    /// <summary>Gets or sets whether a blank secret keeps the stored value; null keeps it when <see cref="CanopyFlow.StoredSecrets"/> lists the field.</summary>
    public bool? KeepWhenBlank { get; set; }

    /// <summary>Gets or sets whether a secret field has a reveal button; null shows it.</summary>
    [PowerForge.Fluent.FluentPreset("NoReveal", false)]
    public bool? Reveal { get; set; }

    /// <summary>Gets the units a duration field offers, in order; empty offers minutes, hours and days.</summary>
    [PowerForge.Fluent.Child("Unit")]
    public IList<CanopyFlowDurationUnit> Units { get; } = new List<CanopyFlowDurationUnit>();

    /// <summary>Gets or sets the name a browser plugin or the host registers a custom field's editor under.</summary>
    public string? EditorName { get; set; }

    /// <summary>
    /// Gets or sets where a select, choice, multiple-choice or lookup field's options come from. With
    /// <see cref="CanopyFlowOptionsSource.Host"/> the host's <c>options</c> hook supplies them as the reader reaches the field and
    /// again when a field in <see cref="DependsOnIds"/> changes, and <see cref="Options"/> may stay empty.
    /// </summary>
    [PowerForge.Fluent.FluentPreset("FromHost", CanopyFlowOptionsSource.Host)]
    public CanopyFlowOptionsSource OptionsSource { get; set; }

    /// <summary>
    /// Gets the ids of the fields this one depends on (at most 16, never secrets): when one changes, host options load again, and a
    /// field without host options starts empty again.
    /// </summary>
    [PowerForge.Fluent.Child("DependsOn")]
    public IList<string> DependsOnIds { get; } = new List<string>();

    /// <summary>Gets the columns of a records field (1 to 16).</summary>
    public IList<CanopyFlowRecordColumn> Columns { get; } = new List<CanopyFlowRecordColumn>();

    /// <summary>Gets or sets the fewest items of a multiple-choice or list answer, from 0 to 1,000.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The count is outside 0 to 1,000.</exception>
    public int? MinItems {
        get => _minItems;
        set => _minItems = value < 0 || value > CanopyFlowValues.MaxItems ? throw new ArgumentOutOfRangeException(nameof(value), value, "An item count is from 0 to 1,000.") : value;
    }

    /// <summary>Gets or sets the most items of a multiple-choice or list answer, from 0 to 1,000.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The count is outside 0 to 1,000.</exception>
    public int? MaxItems {
        get => _maxItems;
        set => _maxItems = value < 0 || value > CanopyFlowValues.MaxItems ? throw new ArgumentOutOfRangeException(nameof(value), value, "An item count is from 0 to 1,000.") : value;
    }

    /// <summary>Gets or sets the built-in check every row of a list field passes.</summary>
    public CanopyFlowItemRule ItemRule { get; set; }

    /// <summary>Gets or sets a pattern every row of a list field matches whole, in the syntax JavaScript and .NET share (as <see cref="CanopyCellValidation.Pattern"/>).</summary>
    public string? ItemPattern { get; set; }

    /// <summary>Gets or sets the shortest duration a duration field accepts.</summary>
    public TimeSpan? MinimumDuration { get; set; }

    /// <summary>Gets or sets the longest duration a duration field accepts.</summary>
    public TimeSpan? MaximumDuration { get; set; }

    /// <summary>Sets the range of a number field.</summary>
    /// <param name="min">The smallest number, or null.</param>
    /// <param name="max">The largest number, or null.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Range(double? min, double? max) { Validation.Minimum = min; Validation.Maximum = max; return this; }

    /// <summary>Sets the range of a date-and-time field, compared at UTC millisecond precision.</summary>
    /// <param name="earliest">The earliest moment, or null.</param>
    /// <param name="latest">The latest moment, or null.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Range(DateTimeOffset? earliest, DateTimeOffset? latest) { Validation.Earliest = earliest; Validation.Latest = latest; return this; }

    /// <summary>Sets the range of a duration field.</summary>
    /// <param name="min">The shortest duration, or null.</param>
    /// <param name="max">The longest duration, or null.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Range(TimeSpan? min, TimeSpan? max) { MinimumDuration = min; MaximumDuration = max; return this; }

    /// <summary>Sets the text length of a text, text area or secret field.</summary>
    /// <param name="min">The fewest characters, or null.</param>
    /// <param name="max">The most characters, or null.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentOutOfRangeException">A length is outside 0 to <see cref="CanopyCellValidation.MaxTextLength"/>.</exception>
    public CanopyFlowField Length(int? min, int? max) { Validation.MinLength = min; Validation.MaxLength = max; return this; }

    /// <summary>Sets a pattern the whole text of a text, text area or secret field matches.</summary>
    /// <param name="pattern">The pattern, in the syntax JavaScript and .NET share.</param>
    /// <param name="message">The message for every failed check of the field, or null for the translated defaults.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Pattern(string pattern, string? message = null) {
        Validation.Pattern = pattern;
        if (message != null) Validation.Message = message;
        return this;
    }

    /// <summary>Sets one message for every failed check of the field, in place of the translated defaults.</summary>
    /// <param name="text">Plain text.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Message(string text) { Validation.Message = text; return this; }

    /// <summary>Adds an option.</summary>
    /// <param name="value">The value: text, a number or true or false.</param>
    /// <param name="label">The text the reader sees, or null to show the value.</param>
    /// <param name="description">A line under the label, or null.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentException"><paramref name="value"/> is not a valid option value.</exception>
    public CanopyFlowField Option(object value, string? label = null, string? description = null) {
        Options.Add(new CanopyFlowOption(value, label) { Description = description });
        return this;
    }

    /// <summary>Adds an option with all its texts, such as a badge, a disabled reason or a group.</summary>
    /// <param name="option">The option.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="option"/> is null.</exception>
    public CanopyFlowField Option(CanopyFlowOption option) {
        Options.Add(option ?? throw new ArgumentNullException(nameof(option)));
        return this;
    }

    /// <summary>Sets how many items a multiple-choice or list answer holds.</summary>
    /// <param name="min">The fewest items, or null.</param>
    /// <param name="max">The most items, or null.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentOutOfRangeException">A count is outside 0 to 1,000.</exception>
    public CanopyFlowField Count(int? min, int? max) { MinItems = min; MaxItems = max; return this; }

    /// <summary>Adds a column to a records field (<see cref="Columns"/>).</summary>
    /// <param name="id">The column id.</param>
    /// <param name="title">The header.</param>
    /// <param name="kind">The cell type.</param>
    /// <param name="configure">Sets the column's other settings, or null.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyFlowField Column(string id, string title, CanopyFlowRecordColumnKind kind = CanopyFlowRecordColumnKind.Text, Action<CanopyFlowRecordColumn>? configure = null) {
        var column = new CanopyFlowRecordColumn(id, title, kind);
        configure?.Invoke(column);
        Columns.Add(column);
        return this;
    }

    /// <summary>Names the two states of a toggle on the review page (<see cref="OnText"/>, <see cref="OffText"/>).</summary>
    /// <param name="on">The text for on.</param>
    /// <param name="off">The text for off.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField States(string on, string off) { OnText = on; OffText = off; return this; }
}
