using CanopyX.Json;

namespace CanopyX;

/// <summary>How a flat grid presents its conditional formatting: a legend of the rules and a rule editor for readers.</summary>
public sealed class CanopyFormatOptions {
    /// <summary>Gets or sets whether a legend above the grid lists the enabled rules that have a label. The static fallback lists them under the table.</summary>
    public bool Legend { get; set; }

    /// <summary>Gets or sets whether the more menu offers the rule editor, where readers add, change, order and switch rules; their rules land in saved views.</summary>
    public bool Editor { get; set; }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (Legend) writer.Property("legend", true);
        if (Editor) writer.Property("editor", true);
        writer.EndObject();
    }
}
