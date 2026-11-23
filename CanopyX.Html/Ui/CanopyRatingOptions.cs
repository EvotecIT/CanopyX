namespace CanopyX.Html.Ui;

/// <summary>Typed rating input options.</summary>
public sealed class CanopyRatingOptions {
    /// <summary>Gets or sets the number of steps, 2 to 10. Default 5.</summary>
    public int Max { get; set; } = 5;
    /// <summary>Gets or sets the starting value, 1 to <see cref="Max"/>, or null for no answer.</summary>
    public int? Value { get; set; }
    /// <summary>Gets or sets whether choosing the current value again, or pressing Delete, clears the answer. Default true.</summary>
    public bool Clearable { get; set; } = true;
    /// <summary>Gets or sets whether a form requires an answer.</summary>
    public bool Required { get; set; }
    /// <summary>Gets or sets whether the rating is shown but cannot be changed.</summary>
    public bool Disabled { get; set; }
    /// <summary>Gets or sets the labels whose <c>RatingValue</c> names each step. Null uses English.</summary>
    public CanopyLabels? Labels { get; set; }
}
