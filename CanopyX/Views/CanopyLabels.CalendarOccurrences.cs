namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the single-occurrence editor heading. Default "Edit this occurrence".</summary>
    public string CalendarEditOccurrence { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the action that excludes this occurrence. Default "Remove this occurrence".</summary>
    public string CalendarRemoveOccurrence { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the scope explanation with <c>{date}</c> and <c>{title}</c>.</summary>
    public string CalendarOccurrenceScope { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the shared-assignment marker with <c>{count}</c> and <c>{resources}</c>.</summary>
    public string CalendarSharedResources { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the resource window description with <c>{resources}</c>, <c>{start}</c>, <c>{end}</c> and <c>{total}</c>.</summary>
    public string CalendarResourceWindow { get => Get(); set => Set(value); }
}
