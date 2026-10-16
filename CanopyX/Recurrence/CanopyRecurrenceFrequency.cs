namespace CanopyX;

/// <summary>How often a <see cref="CanopyRecurrence"/> repeats: the <c>FREQ</c> part of an RFC 5545 recurrence rule.</summary>
public enum CanopyRecurrenceFrequency {
    /// <summary>Every day, or every <see cref="CanopyRecurrence.Interval"/> days (<c>DAILY</c>).</summary>
    Daily = 0,

    /// <summary>Every week, or every <see cref="CanopyRecurrence.Interval"/> weeks (<c>WEEKLY</c>).</summary>
    Weekly,

    /// <summary>Every month, or every <see cref="CanopyRecurrence.Interval"/> months (<c>MONTHLY</c>).</summary>
    Monthly,

    /// <summary>Every year, or every <see cref="CanopyRecurrence.Interval"/> years (<c>YEARLY</c>).</summary>
    Yearly
}
