namespace CanopyX;

/// <summary>How an enum or state presenter shows the values of its quiet tones (<see cref="CanopyGridPresenter.QuietTones"/>).</summary>
public enum CanopyGridQuietStyle {
    /// <summary>Plain muted text, so the values that keep a chip or dot stand out. The default.</summary>
    Muted,
    /// <summary>Plain text in the normal text colour, for values that are ordinary rather than secondary.</summary>
    Plain
}
