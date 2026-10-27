using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>One explicitly ordered occurrence of an existing grid record, with optional host annotations.</summary>
public sealed class CanopyPathHop {
    private string? _label;

    /// <summary>Creates a step referring to a stable grid record identity.</summary>
    /// <param name="record">The existing record id, never a row position or display label.</param>
    /// <param name="label">Optional relationship or step explanation, up to 4,096 characters.</param>
    public CanopyPathHop(string record, string? label = null) {
        CanopyPath.RequireText(record, nameof(record));
        Record = record;
        Label = label;
    }

    /// <summary>Gets the referenced record id. A chain may refer to the same record more than once.</summary>
    public string Record { get; }

    /// <summary>Gets or sets a host-supplied step explanation; null omits it.</summary>
    public string? Label {
        get => _label;
        set { if (value != null) CanopyPath.RequireText(value, nameof(value), 4096); _label = value; }
    }

    /// <summary>Gets the distinct annotations on this occurrence, in display order.</summary>
    public IList<CanopyPathFlag> Flags { get; } = new List<CanopyPathFlag>();

    /// <summary>Gets up to 16 badges on this occurrence. These do not change the referenced record.</summary>
    public IList<CanopyBadge> Badges { get; } = new List<CanopyBadge>();

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("record", Record).OptionalProperty("label", Label);
        if (Flags.Count > 0) {
            writer.Name("flags").BeginArray();
            foreach (var flag in Flags) writer.String(CanopyPath.FlagName(flag));
            writer.EndArray();
        }
        if (Badges.Count > 0) {
            writer.Name("badges").BeginArray();
            foreach (var badge in Badges) badge.WriteJson(writer);
            writer.EndArray();
        }
        writer.EndObject();
    }
}
