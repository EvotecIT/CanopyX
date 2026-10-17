namespace CanopyX.Html;

/// <summary>
/// The text direction of a page or fragment (<see cref="CanopyHtmlOptions.Direction"/>).
/// </summary>
public enum CanopyTextDirection {
    /// <summary>Writes no <c>dir</c> attribute: the page's or host page's direction applies.</summary>
    Auto = 0,

    /// <summary>Left to right (<c>dir="ltr"</c>).</summary>
    Ltr,

    /// <summary>Right to left (<c>dir="rtl"</c>), for languages such as Arabic and Hebrew.</summary>
    Rtl
}
