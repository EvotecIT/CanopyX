namespace CanopyX;

/// <summary>The icon of a change list action; every action also has its label as text or accessible name.</summary>
public enum CanopyChangeActionIcon {
    /// <summary>No icon: the action shows its label.</summary>
    None = 0,

    /// <summary>Two sheets: copy something.</summary>
    Copy,

    /// <summary>Two columns of lines: open a comparison.</summary>
    Diff,

    /// <summary>A check mark: acknowledge or mark as expected.</summary>
    Check,

    /// <summary>An arrow out of a box: open the related item.</summary>
    Open,

    /// <summary>An arrow into a tray: export or download.</summary>
    Download,

    /// <summary>Two arrows: compare across places.</summary>
    Compare,

    /// <summary>A flag: report or flag.</summary>
    Flag
}