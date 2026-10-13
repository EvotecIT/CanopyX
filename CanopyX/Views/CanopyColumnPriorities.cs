namespace CanopyX;

/// <summary>
/// Named responsive priorities for <see cref="CanopyColumn.ResponsivePriority"/>. The values match the browser
/// runtime's named priorities (<c>CanopyX.columnPriorities</c>): zero and one are essential, 10000 and above are
/// optional, and the values between are normal. Within a level, larger values give way first.
/// </summary>
public static class CanopyColumnPriorities {
    /// <summary>Zero: the column keeps its content width and never hides for width.</summary>
    public const int Essential = 0;

    /// <summary>5000: the column gives up its slack when the width runs short, and hides on phones. The default for columns other than the identity column.</summary>
    public const int Normal = 5000;

    /// <summary>10000: the column hides first when the width runs short.</summary>
    public const int Optional = 10000;
}
