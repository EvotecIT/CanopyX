namespace CanopyX;

/// <summary>What happened to a file or item in a change list.</summary>
public enum CanopyChangeKind {
    /// <summary>It is new.</summary>
    Added = 0,

    /// <summary>It is gone.</summary>
    Removed,

    /// <summary>Its content or its metadata changed; <see cref="CanopyChangeItem.KindLabel"/> can say which, such as "Owner changed".</summary>
    Modified,

    /// <summary>It moved from <see cref="CanopyChangeItem.PreviousPath"/> to <see cref="CanopyChangeItem.Path"/>.</summary>
    Renamed
}