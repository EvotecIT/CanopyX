using CanopyX.Json;

namespace CanopyX;

/// <summary>How a flat grid copies cell ranges and takes pasted text.</summary>
/// <remarks>
/// Copy writes tab-separated text, which every spreadsheet and text editor reads, and an HTML table beside it that keeps
/// numbers and dates typed for spreadsheet applications. Paste reads tab-separated text into the cells from the first range's
/// corner; CanopyX never writes data itself, so pasted values go to the host's paste event and, with the editing part, through
/// its checks and undo.
/// </remarks>
public sealed class CanopyGridClipboard {
    /// <summary>Gets or sets whether copies start with the column titles (and the group rows above them). Defaults to false.</summary>
    public bool CopyHeaders { get; set; }

    /// <summary>Gets or sets whether copies carry the shown text or the raw values. Defaults to <see cref="CanopyGridClipboardValues.Display"/>.</summary>
    public CanopyGridClipboardValues CopyValues { get; set; }

    /// <summary>Gets or sets whether Ctrl/Cmd+V and the cell menu paste into the grid. Defaults to true.</summary>
    public bool Paste { get; set; } = true;

    internal bool IsDefault => !CopyHeaders && CopyValues == CanopyGridClipboardValues.Display && Paste;

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (CopyHeaders) writer.Property("copyHeaders", true);
        if (CopyValues == CanopyGridClipboardValues.Raw) writer.Property("copyValues", "raw");
        if (!Paste) writer.Property("paste", false);
        writer.EndObject();
    }
}
