namespace CanopyX.Html.Ui;

/// <summary>Typed select options. Loaders, icon renderers and change callbacks are registered by the host in JavaScript.</summary>
public sealed class CanopySelectOptions {
    /// <summary>Gets or sets whether several values can be chosen, shown as chips.</summary>
    public bool Multiple { get; set; }
    /// <summary>Gets or sets whether the reader types to filter. Default true; false opens the list like a button.</summary>
    public bool Search { get; set; } = true;
    /// <summary>Gets or sets whether typed text can become a new value (tags).</summary>
    public bool Tags { get; set; }
    /// <summary>Gets or sets an address that answers matches for <c>?q=</c> as a JSON list of options. Null searches the written options.</summary>
    public string? Source { get; set; }
    /// <summary>Gets or sets the fewest typed characters before the source is asked. Null uses 1 with a source and 0 without.</summary>
    public int? MinLength { get; set; }
    /// <summary>Gets or sets the most values a multiple select takes. Null takes any number.</summary>
    public int? Max { get; set; }
    /// <summary>Gets or sets the empty field's hint.</summary>
    public string? Placeholder { get; set; }
    /// <summary>Gets or sets whether a form requires an answer.</summary>
    public bool Required { get; set; }
    /// <summary>Gets or sets whether the select is shown but cannot be changed.</summary>
    public bool Disabled { get; set; }
}
