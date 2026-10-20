using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// A typed field of a flow step or section: its label, help, starting value, condition, layout, the setting it writes, and
/// the checks its answer passes. The browser draws it with the editor of its <see cref="Kind"/> (see "Fields" in docs/flow.md).
/// </summary>
/// <remarks>
/// Properties are named as nouns and the fluent methods that set them as verbs, so a field reads as a sentence:
/// <c>f =&gt; f.Required().Help("A host name, such as mail.example.com").Path("mail.host")</c>. The flow checks every setting when it is
/// written, and throws <see cref="InvalidOperationException"/> for a setting that does not fit the field's kind.
/// </remarks>
public sealed partial class CanopyFlowField {
    private int? _rowCount;
    private double? _numberStep;
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
    public string? HelpText { get; set; }

    /// <summary>Gets or sets the empty input's hint (text, number, lookup, text area and list fields). At most 256 characters.</summary>
    /// <remarks>
    /// A placeholder is drawn fainter and in italics, and disappears as soon as the user types. Keep it a short hint about the expected format, such as
    /// "For example: name@example.com"; a sample answer the user has to read while typing belongs in <see cref="HelpText"/>.
    /// </remarks>
    public string? PlaceholderText { get; set; }

    /// <summary>
    /// Gets or sets the starting value in create mode, of the field's kind: text, a number, true or false, a date
    /// (<see cref="DateTime"/> or <c>yyyy-MM-dd</c>), a time (<see cref="TimeSpan"/> or <c>HH:mm</c>), a moment
    /// (<see cref="DateTimeOffset"/>, <see cref="DateTime"/> or ISO 8601), a duration (<see cref="TimeSpan"/> or ISO 8601), an
    /// option value, or a sequence of option values or texts. Null omits the default. A secret field has none.
    /// </summary>
    public object? DefaultValue { get; set; }

    /// <summary>Gets or sets the condition under which the field shows; null always shows it.</summary>
    public CanopyFlowCondition? Condition { get; set; }

    /// <summary>Gets or sets the field's width on wide forms.</summary>
    public CanopyFlowFieldWidth Width { get; set; }

    /// <summary>Gets or sets the parameter name in an equivalent command, for hosts that show one: an id-like name.</summary>
    public string? ParameterName { get; set; }

    /// <summary>Gets or sets the setting the field writes, as dot-separated names (<c>mail.smtp.host</c>); the proposal's JSON patch uses it.</summary>
    /// <remarks>The host prepares any missing parent objects before applying the patch to its configuration.</remarks>
    public string? ConfigPath { get; set; }

    /// <summary>Gets or sets whether a non-secret value stays out of the host's drafts and exports. It still shows on the review page.</summary>
    public bool IsSensitive { get; set; }

    /// <summary>
    /// Gets the checks of the answer: required, a number range (<see cref="CanopyCellValidation.Minimum"/>,
    /// <see cref="CanopyCellValidation.Maximum"/>), a date-and-time range (<see cref="CanopyCellValidation.Earliest"/>,
    /// <see cref="CanopyCellValidation.Latest"/>), text lengths and a pattern (text, text area and secret fields), and one message.
    /// </summary>
    public CanopyCellValidation Validation { get; } = new CanopyCellValidation();

    /// <summary>Gets the options of a select, choice, multiple-choice or lookup field (at most 1,000).</summary>
    public IList<CanopyFlowOption> Options { get; } = new List<CanopyFlowOption>();

    /// <summary>Gets or sets how a choice field draws its options.</summary>
    public CanopyFlowChoiceDisplay Display { get; set; }

    /// <summary>Gets or sets what the review page says for a toggle that is on, for example "Checked". Plain text of at most 60 characters.</summary>
    public string? OnText { get; set; }

    /// <summary>Gets or sets what the review page says for a toggle that is off. Plain text of at most 60 characters.</summary>
    public string? OffText { get; set; }

    /// <summary>Gets or sets the visible rows of a text area, from 2 to 20; null uses 4.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The count is outside 2 to 20.</exception>
    public int? RowCount {
        get => _rowCount;
        set => _rowCount = value < 2 || value > 20 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A text area shows 2 to 20 rows.") : value;
    }

    /// <summary>Gets or sets the step of a number field: Up and Down move by it.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The step is not a positive finite number.</exception>
    public double? NumberStep {
        get => _numberStep;
        set => _numberStep = value.HasValue && (double.IsNaN(value.Value) || double.IsInfinity(value.Value) || value.Value <= 0 || value.Value > 9007199254740991d)
            ? throw new ArgumentOutOfRangeException(nameof(value), value, "A step must be a positive finite number.") : value;
    }

    /// <summary>Gets or sets whether a blank secret keeps the stored value; null keeps it when <see cref="CanopyFlow.StoredSecrets"/> lists the field.</summary>
    public bool? KeepsWhenBlank { get; set; }

    /// <summary>Gets or sets whether a secret field has a reveal button; null shows it.</summary>
    public bool? ShowsReveal { get; set; }

    /// <summary>Gets the units a duration field offers, in order; empty offers minutes, hours and days.</summary>
    public IList<CanopyFlowDurationUnit> DurationUnits { get; } = new List<CanopyFlowDurationUnit>();

    /// <summary>Gets or sets the name a browser plugin or the host registers a custom field's editor under.</summary>
    public string? EditorName { get; set; }

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
    public string? ListItemPattern { get; set; }

    /// <summary>Gets or sets the shortest duration a duration field accepts.</summary>
    public TimeSpan? MinimumDuration { get; set; }

    /// <summary>Gets or sets the longest duration a duration field accepts.</summary>
    public TimeSpan? MaximumDuration { get; set; }

    /// <summary>Makes an empty answer an error.</summary>
    /// <returns>The field.</returns>
    public CanopyFlowField Required() { IsRequired = true; return this; }

    /// <summary>Shows the field without letting the reader change it.</summary>
    /// <returns>The field.</returns>
    public CanopyFlowField ReadOnly() { IsReadOnly = true; return this; }

    /// <summary>Sets the line under the label (<see cref="HelpText"/>).</summary>
    /// <param name="text">Plain text.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Help(string text) { HelpText = text; return this; }

    /// <summary>Sets the empty input's hint (<see cref="PlaceholderText"/>): a short hint such as the expected format, not a full sample answer, which belongs in <see cref="Help"/>.</summary>
    /// <param name="text">Plain text.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Placeholder(string text) { PlaceholderText = text; return this; }

    /// <summary>Sets the starting value in create mode (<see cref="DefaultValue"/>).</summary>
    /// <param name="value">A value of the field's kind.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="value"/> is null.</exception>
    public CanopyFlowField Default(object value) { DefaultValue = value ?? throw new ArgumentNullException(nameof(value)); return this; }

    /// <summary>Shows the field only while a condition holds (<see cref="Condition"/>).</summary>
    /// <param name="condition">The condition.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="condition"/> is null.</exception>
    public CanopyFlowField When(CanopyFlowCondition condition) { Condition = condition ?? throw new ArgumentNullException(nameof(condition)); return this; }

    /// <summary>Makes the field half as wide, so two half fields share a row on wide forms.</summary>
    /// <returns>The field.</returns>
    public CanopyFlowField Half() { Width = CanopyFlowFieldWidth.Half; return this; }

    /// <summary>Sets the parameter name in an equivalent command (<see cref="ParameterName"/>).</summary>
    /// <param name="name">An id-like name.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Parameter(string name) { ParameterName = name; return this; }

    /// <summary>Sets the setting the field writes (<see cref="ConfigPath"/>).</summary>
    /// <param name="dotPath">Dot-separated names, for example <c>mail.smtp.host</c>.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Path(string dotPath) { ConfigPath = dotPath; return this; }

    /// <summary>Keeps a non-secret value out of the host's drafts and exports (<see cref="IsSensitive"/>).</summary>
    /// <returns>The field.</returns>
    public CanopyFlowField Sensitive() { IsSensitive = true; return this; }

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

    /// <summary>Sets the step of a number field (<see cref="NumberStep"/>).</summary>
    /// <param name="step">A positive finite number.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The step is not a positive finite number.</exception>
    public CanopyFlowField Step(double step) { NumberStep = step; return this; }

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

    /// <summary>Draws a choice field's options as cards.</summary>
    /// <returns>The field.</returns>
    public CanopyFlowField Cards() { Display = CanopyFlowChoiceDisplay.Cards; return this; }

    /// <summary>Draws a choice field's options as a plain radio list.</summary>
    /// <returns>The field.</returns>
    public CanopyFlowField AsList() { Display = CanopyFlowChoiceDisplay.List; return this; }

    /// <summary>Sets the visible rows of a text area (<see cref="RowCount"/>).</summary>
    /// <param name="count">From 2 to 20.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The count is outside 2 to 20.</exception>
    public CanopyFlowField Rows(int count) { RowCount = count; return this; }

    /// <summary>Sets the built-in check every row of a list field passes (<see cref="ItemRule"/>).</summary>
    /// <param name="rule">The check.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField Items(CanopyFlowItemRule rule) { ItemRule = rule; return this; }

    /// <summary>Sets a pattern every row of a list field matches whole (<see cref="ListItemPattern"/>).</summary>
    /// <param name="pattern">The pattern.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField ItemPattern(string pattern) { ListItemPattern = pattern; return this; }

    /// <summary>Sets how many items a multiple-choice or list answer holds.</summary>
    /// <param name="min">The fewest items, or null.</param>
    /// <param name="max">The most items, or null.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentOutOfRangeException">A count is outside 0 to 1,000.</exception>
    public CanopyFlowField Count(int? min, int? max) { MinItems = min; MaxItems = max; return this; }

    /// <summary>Sets whether a blank secret keeps the stored value (<see cref="KeepsWhenBlank"/>).</summary>
    /// <param name="keep">Whether a blank answer keeps the stored value.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField KeepWhenBlank(bool keep = true) { KeepsWhenBlank = keep; return this; }

    /// <summary>Leaves out a secret field's reveal button (<see cref="ShowsReveal"/>).</summary>
    /// <returns>The field.</returns>
    public CanopyFlowField NoReveal() { ShowsReveal = false; return this; }

    /// <summary>Sets the units a duration field offers, in order (<see cref="DurationUnits"/>).</summary>
    /// <param name="units">One or more distinct units.</param>
    /// <returns>The field.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="units"/> is null.</exception>
    public CanopyFlowField Units(params CanopyFlowDurationUnit[] units) {
        if (units == null) throw new ArgumentNullException(nameof(units));
        DurationUnits.Clear();
        foreach (var unit in units) DurationUnits.Add(unit);
        return this;
    }

    /// <summary>Names the two states of a toggle on the review page (<see cref="OnText"/>, <see cref="OffText"/>).</summary>
    /// <param name="on">The text for on.</param>
    /// <param name="off">The text for off.</param>
    /// <returns>The field.</returns>
    public CanopyFlowField States(string on, string off) { OnText = on; OffText = off; return this; }
}
