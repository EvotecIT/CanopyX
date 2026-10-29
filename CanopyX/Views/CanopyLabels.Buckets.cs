namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the grouping chip's partition selector label.</summary>
    public string GridBucket { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the unpartitioned grouping choice.</summary>
    public string GridBucketNone { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the calendar-day choice.</summary>
    public string GridBucketDay { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the week choice.</summary>
    public string GridBucketWeek { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the month choice.</summary>
    public string GridBucketMonth { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the quarter choice.</summary>
    public string GridBucketQuarter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the year choice.</summary>
    public string GridBucketYear { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the hour-of-day choice.</summary>
    public string GridBucketHour { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the weekday choice.</summary>
    public string GridBucketWeekday { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the equal-width numeric interval choice and width input label.</summary>
    public string GridBucketWidth { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the explicit numeric boundaries choice and input label.</summary>
    public string GridBucketEdges { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the numeric interval origin input label.</summary>
    public string GridBucketOrigin { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the invalid partition settings message.</summary>
    public string GridBucketInvalid { get => Get(); set => Set(value); }
}
