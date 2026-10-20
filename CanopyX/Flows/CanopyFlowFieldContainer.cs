using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// The fields of a flow step or section, with the fluent methods that add them. Each method returns the step or section
/// itself, so a chain of fields stays on it.
/// </summary>
/// <typeparam name="TContainer">The step or section type.</typeparam>
public abstract class CanopyFlowFieldContainer<TContainer> where TContainer : CanopyFlowFieldContainer<TContainer> {
    private protected CanopyFlowFieldContainer() {
    }

    /// <summary>Gets the fields, in order.</summary>
    public IList<CanopyFlowField> Fields { get; } = new List<CanopyFlowField>();

    /// <summary>Adds a single-line text field.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Text(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Text, label, configure);

    /// <summary>Adds a number field.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Number(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Number, label, configure);

    /// <summary>Adds a date field.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Date(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Date, label, configure);

    /// <summary>Adds a date-and-time field, shown in the flow's time zone.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer DateTime(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.DateTime, label, configure);

    /// <summary>Adds a time-of-day field.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Time(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Time, label, configure);

    /// <summary>Adds a drop-down field; add its options in <paramref name="configure"/>.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's options and other settings.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Select(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Select, label, configure);

    /// <summary>Adds a switch for true and false.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Toggle(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Toggle, label, configure);

    /// <summary>Adds a combobox that suggests its options as the reader types.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's options and other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Lookup(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Lookup, label, configure);

    /// <summary>Adds a radio group or choice cards; add its options in <paramref name="configure"/>.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's options and other settings.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Choice(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Choice, label, configure);

    /// <summary>Adds check boxes for several options; add its options in <paramref name="configure"/>.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's options and other settings.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer MultiChoice(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.MultiChoice, label, configure);

    /// <summary>Adds a text area for several lines of text.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer TextArea(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.TextArea, label, configure);

    /// <summary>Adds a list of text values, one per row.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer List(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.List, label, configure);

    /// <summary>Adds a masked secret field, whose value reaches only the host's submit handler.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Secret(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Secret, label, configure);

    /// <summary>Adds a duration field: a number and a unit.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Duration(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Duration, label, configure);

    /// <summary>Adds a records field: rows of typed cells, edited as a small table; add its columns in <paramref name="configure"/>.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="configure">Adds the columns (<see cref="CanopyFlowField.Column"/>) and sets the field's other settings.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public TContainer Records(string id, string label, Action<CanopyFlowField>? configure = null) => Add(id, CanopyFlowFieldKind.Records, label, configure);

    /// <summary>Adds a field drawn by an editor a browser plugin or the host registers.</summary>
    /// <param name="id">The field id, unique in the flow.</param>
    /// <param name="label">The label.</param>
    /// <param name="editor">The registered editor name.</param>
    /// <param name="configure">Sets the field's other settings, or null.</param>
    /// <returns>This step or section.</returns>
    /// <exception cref="ArgumentException"><paramref name="id"/> or <paramref name="editor"/> is not a valid name.</exception>
    public TContainer Custom(string id, string label, string editor, Action<CanopyFlowField>? configure = null) {
        CanopyFlowValues.RequireIdentifier(editor, nameof(editor), "An editor name");
        var field = new CanopyFlowField(id, CanopyFlowFieldKind.Custom, label) { EditorName = editor };
        configure?.Invoke(field);
        Fields.Add(field);
        return (TContainer)this;
    }

    private TContainer Add(string id, CanopyFlowFieldKind kind, string label, Action<CanopyFlowField>? configure) {
        var field = new CanopyFlowField(id, kind, label);
        configure?.Invoke(field);
        Fields.Add(field);
        return (TContainer)this;
    }
}
