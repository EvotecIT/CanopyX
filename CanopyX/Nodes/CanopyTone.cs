using System;

namespace CanopyX;

/// <summary>
/// Semantic colour of a cell or badge. A tone is a name; the theme maps each name to a colour, so hosts never pick
/// colours directly.
/// </summary>
/// <remarks>
/// <para>
/// CanopyX ships colours for six tones: <see cref="Neutral"/>, <see cref="Info"/>, <see cref="Success"/>,
/// <see cref="Warning"/>, <see cref="Danger"/>, and <see cref="Muted"/>. A host that needs more, for example one
/// tone per step of a severity scale, names its own with <see cref="Named"/> and supplies their colours in its theme:
/// the browser runtime reads the text colour of tone <c>high</c> from the CSS custom property
/// <c>--cx-tone-high</c> and the badge background from <c>--cx-tone-high-bg</c> (when that is missing, a tint of the
/// text colour). The static outline takes them from <c>CanopyStaticHtmlOptions.ToneColors</c>, and with
/// <c>UseThemeVariables</c> also from those properties.
/// </para>
/// <para>
/// The well-known tones are static properties, so <c>CanopyTone.Danger</c> reads as it did when this type was an
/// enum. They are not constants: compare with <c>==</c> instead of constant patterns (<c>is CanopyTone.None</c>) or
/// <c>case</c> labels. <see langword="default"/> is <see cref="None"/>.
/// </para>
/// </remarks>
public readonly struct CanopyTone : IEquatable<CanopyTone> {
    /// <summary>The most characters a tone name can have.</summary>
    public const int MaxNameLength = 32;

    private CanopyTone(string name) {
        Name = name;
    }

    /// <summary>Gets no tone; the text uses the normal colour.</summary>
    public static CanopyTone None => default;

    /// <summary>Gets a quiet, uncoloured emphasis, for example a count badge.</summary>
    public static CanopyTone Neutral { get; } = new CanopyTone("neutral");

    /// <summary>Gets the informational tone.</summary>
    public static CanopyTone Info { get; } = new CanopyTone("info");

    /// <summary>Gets the tone for good or passing.</summary>
    public static CanopyTone Success { get; } = new CanopyTone("success");

    /// <summary>Gets the tone for needs attention.</summary>
    public static CanopyTone Warning { get; } = new CanopyTone("warning");

    /// <summary>Gets the tone for failing, critical, or destructive.</summary>
    public static CanopyTone Danger { get; } = new CanopyTone("danger");

    /// <summary>Gets the tone for de-emphasised text, for example "not collected".</summary>
    public static CanopyTone Muted { get; } = new CanopyTone("muted");

    /// <summary>Gets the wire name of the tone, or <see langword="null"/> for <see cref="None"/>.</summary>
    public string? Name { get; }

    /// <summary>Gets whether CanopyX ships colours for the tone; false for <see cref="None"/> and for host tones.</summary>
    public bool IsBuiltIn => Name == "neutral" || Name == "info" || Name == "success" || Name == "warning" || Name == "danger" || Name == "muted";

    /// <summary>Returns the tone with a name, either one of the six CanopyX ships or one the host's theme defines.</summary>
    /// <param name="name">
    /// The name: a lowercase letter followed by lowercase letters, digits, and hyphens, at most
    /// <see cref="MaxNameLength"/> characters, for example <c>critical</c> or <c>severity-high</c>. A name cannot end
    /// in <c>-bg</c>, which is how the theme names the badge background of a tone.
    /// </param>
    /// <returns>The tone.</returns>
    /// <exception cref="ArgumentException"><paramref name="name"/> is null or not a valid tone name.</exception>
    public static CanopyTone Named(string name) {
        if (!IsValidName(name)) {
            throw new ArgumentException("A tone name is a lowercase letter followed by lowercase letters, digits, and hyphens, at most " + MaxNameLength + " characters, and does not end in -bg.", nameof(name));
        }

        return new CanopyTone(name);
    }

    /// <summary>Returns whether two tones have the same name.</summary>
    /// <param name="left">The first tone.</param>
    /// <param name="right">The second tone.</param>
    public static bool operator ==(CanopyTone left, CanopyTone right) => left.Equals(right);

    /// <summary>Returns whether two tones have different names.</summary>
    /// <param name="left">The first tone.</param>
    /// <param name="right">The second tone.</param>
    public static bool operator !=(CanopyTone left, CanopyTone right) => !left.Equals(right);

    /// <inheritdoc />
    public bool Equals(CanopyTone other) => string.Equals(Name, other.Name, StringComparison.Ordinal);

    /// <inheritdoc />
    public override bool Equals(object? obj) => obj is CanopyTone other && Equals(other);

    /// <inheritdoc />
    public override int GetHashCode() => Name == null ? 0 : StringComparer.Ordinal.GetHashCode(Name);

    /// <summary>Returns the tone name, or an empty string for <see cref="None"/>.</summary>
    public override string ToString() => Name ?? string.Empty;

    private static bool IsValidName(string? name) {
        if (string.IsNullOrEmpty(name) || name!.Length > MaxNameLength || name[0] < 'a' || name[0] > 'z' || name.EndsWith("-bg", StringComparison.Ordinal)) {
            return false;
        }

        foreach (var ch in name) {
            if (!((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-')) {
                return false;
            }
        }

        return true;
    }
}
