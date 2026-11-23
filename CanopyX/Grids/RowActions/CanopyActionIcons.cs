using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// The icon keys action buttons draw: row actions (<see cref="CanopyRowAction"/>) and change-list actions
/// (<see cref="CanopyChangeAction"/>). Each kind of action lists the keys it accepts in its documentation; a key it does
/// not draw is refused when the view is written.
/// </summary>
public static class CanopyActionIcons {
    /// <summary>A check mark, the default of a row action.</summary>
    public static Icon Check { get; } = Icon.Named("check");
    /// <summary>Start or run (row actions).</summary>
    public static Icon Play { get; } = Icon.Named("play");
    /// <summary>Pause (row actions).</summary>
    public static Icon Pause { get; } = Icon.Named("pause");
    /// <summary>Stop (row actions).</summary>
    public static Icon Stop { get; } = Icon.Named("stop");
    /// <summary>Run again or retry (row actions).</summary>
    public static Icon Retry { get; } = Icon.Named("retry");
    /// <summary>Edit (row actions).</summary>
    public static Icon Edit { get; } = Icon.Named("edit");
    /// <summary>Delete (row actions).</summary>
    public static Icon Delete { get; } = Icon.Named("delete");
    /// <summary>Copy.</summary>
    public static Icon Copy { get; } = Icon.Named("copy");
    /// <summary>Open elsewhere.</summary>
    public static Icon Open { get; } = Icon.Named("open");
    /// <summary>Close or dismiss (row actions).</summary>
    public static Icon Close { get; } = Icon.Named("close");
    /// <summary>Download.</summary>
    public static Icon Download { get; } = Icon.Named("download");
    /// <summary>Show the difference (change-list actions).</summary>
    public static Icon Diff { get; } = Icon.Named("diff");
    /// <summary>Compare side by side (change-list actions).</summary>
    public static Icon Compare { get; } = Icon.Named("compare");
    /// <summary>A flag (change-list actions).</summary>
    public static Icon Flag { get; } = Icon.Named("flag");

    internal static readonly HashSet<string> RowKeys = new(StringComparer.Ordinal) {
        "check", "play", "pause", "stop", "retry", "edit", "delete", "copy", "open", "close", "download"
    };

    internal static readonly HashSet<string> ChangeKeys = new(StringComparer.Ordinal) {
        "copy", "diff", "check", "open", "download", "compare", "flag"
    };
}
