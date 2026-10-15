using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A field's value before and after a change: one row of a before/after section or of a timeline event.</summary>
/// <remarks>When both values are lists (<see cref="CanopyCell.Items"/>), the record panel marks the items removed and added.</remarks>
public sealed class CanopyFieldChange {
    /// <summary>Creates a change.</summary>
    /// <param name="name">The visible name of the changed field, 1 to 4,096 characters.</param>
    /// <param name="before">The value before the change; null when it had none.</param>
    /// <param name="after">The value after the change; null when it has none.</param>
    /// <exception cref="ArgumentException">The name is blank or too long.</exception>
    public CanopyFieldChange(string name, CanopyCell? before, CanopyCell? after) {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 4096) throw new ArgumentException("A changed field has a name of 1 to 4,096 visible characters.", nameof(name));
        Name = name;
        Before = before;
        After = after;
    }

    /// <summary>Gets the visible name of the changed field.</summary>
    public string Name { get; }

    /// <summary>Gets the value before the change, or null.</summary>
    public CanopyCell? Before { get; }

    /// <summary>Gets the value after the change, or null.</summary>
    public CanopyCell? After { get; }

    /// <summary>Gets or sets how both values are formatted when they have no display text: text (the default), a number or a date.</summary>
    public CanopyColumnKind Kind { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("name", Name).Name("before");
        if (Before == null) writer.Null(); else Before.WriteJson(writer);
        writer.Name("after");
        if (After == null) writer.Null(); else After.WriteJson(writer);
        if (Kind != CanopyColumnKind.Text) writer.Property("kind", CanopyJsonNames.ColumnKind(Kind));
        writer.EndObject();
    }
}
