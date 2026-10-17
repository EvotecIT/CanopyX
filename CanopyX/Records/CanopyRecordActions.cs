using System;

namespace CanopyX;

/// <summary>The built-in actions of the record panel's actions menu. Host and plugin actions join them in the browser.</summary>
[Flags]
public enum CanopyRecordActions {
    /// <summary>No built-in action.</summary>
    None = 0,
    /// <summary>Copy the record's values (tab-separated) or its JSON.</summary>
    Copy = 1,
    /// <summary>Print the record alone, every section expanded.</summary>
    Print = 2,
    /// <summary>Download the record as CSV or JSON.</summary>
    Export = 4,
    /// <summary>Copy the record's address (with <see cref="CanopyRecordPanel.DeepLink"/>).</summary>
    Link = 8,
    /// <summary>Every built-in action.</summary>
    All = Copy | Print | Export | Link
}
