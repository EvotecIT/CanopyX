using System;

namespace CanopyX.Rendering;

/// <summary>
/// The colours of the static outline: the same base colours the browser runtime is themed with (surface, text,
/// accent, line, and one colour for each of the four coloured tones CanopyX ships). Muted text, header and detail
/// backgrounds, strong lines, and badge backgrounds are mixed from them the way the runtime's stylesheet mixes them,
/// so an outline and a grid given the same base colours look alike.
/// </summary>
/// <remarks>
/// <para>
/// A colour is <c>#</c> followed by three or six hex digits, because it is written into inline styles, which is what
/// email clients, print, and Word keep. <see cref="Light"/> and <see cref="Dark"/> create the two palettes of the
/// runtime; a host with design tokens of its own starts from either and sets the colours its tokens resolve to:
/// </para>
/// <code>
/// var options = new CanopyStaticHtmlOptions { Theme = CanopyStaticTheme.Dark() };
/// options.Theme.Surface = "#10141a";                        // the token of the card the outline sits on
/// options.Theme.Accent = "#7aa2f7";
/// options.ToneColors[CanopyTone.Named("critical")] = "#ff8a80";   // a tone of the host, for this theme
/// </code>
/// <para>
/// The colours of the host's own tones stay in <see cref="CanopyStaticHtmlOptions.ToneColors"/>; they are literals
/// too, so they belong to the theme they were chosen for. In a page whose theme is decided in the browser, also set
/// <see cref="CanopyStaticHtmlOptions.UseThemeVariables"/>.
/// </para>
/// </remarks>
public sealed class CanopyStaticTheme {
    private string _surface = "#ffffff";
    private string _text = "#1f2328";
    private string _accent = "#0a58ca";
    private string _line = "#d1d9e0";
    private string _info = "#0550ae";
    private string _success = "#116329";
    private string _warning = "#7d4e00";
    private string _danger = "#b3261e";

    /// <summary>Creates a theme with the light palette, the same as <see cref="Light"/>.</summary>
    public CanopyStaticTheme() {
    }

    /// <summary>Creates a light theme: dark text on white, the light palette of the browser runtime.</summary>
    /// <returns>A new theme; changing it affects only the options it is assigned to.</returns>
    public static CanopyStaticTheme Light() => new CanopyStaticTheme();

    /// <summary>Creates a dark theme: light text on a dark surface, the dark palette of the browser runtime.</summary>
    /// <returns>A new theme; changing it affects only the options it is assigned to.</returns>
    public static CanopyStaticTheme Dark() => new CanopyStaticTheme {
        _surface = "#0d1117",
        _text = "#e6edf3",
        _accent = "#58a6ff",
        _line = "#30363d",
        _info = "#79c0ff",
        _success = "#56d364",
        _warning = "#e3b341",
        _danger = "#ff7b72"
    };

    /// <summary>Gets or sets the background of the outline.</summary>
    /// <exception cref="ArgumentException">The value is not <c>#</c> followed by three or six hex digits.</exception>
    public string Surface {
        get => _surface;
        set => _surface = Require(value, nameof(value));
    }

    /// <summary>Gets or sets the text colour.</summary>
    /// <exception cref="ArgumentException">The value is not <c>#</c> followed by three or six hex digits.</exception>
    public string Text {
        get => _text;
        set => _text = Require(value, nameof(value));
    }

    /// <summary>Gets or sets the colour of links.</summary>
    /// <exception cref="ArgumentException">The value is not <c>#</c> followed by three or six hex digits.</exception>
    public string Accent {
        get => _accent;
        set => _accent = Require(value, nameof(value));
    }

    /// <summary>Gets or sets the colour of the lines between rows.</summary>
    /// <exception cref="ArgumentException">The value is not <c>#</c> followed by three or six hex digits.</exception>
    public string Line {
        get => _line;
        set => _line = Require(value, nameof(value));
    }

    /// <summary>Gets or sets the colour of <see cref="CanopyTone.Info"/>.</summary>
    /// <exception cref="ArgumentException">The value is not <c>#</c> followed by three or six hex digits.</exception>
    public string Info {
        get => _info;
        set => _info = Require(value, nameof(value));
    }

    /// <summary>Gets or sets the colour of <see cref="CanopyTone.Success"/>.</summary>
    /// <exception cref="ArgumentException">The value is not <c>#</c> followed by three or six hex digits.</exception>
    public string Success {
        get => _success;
        set => _success = Require(value, nameof(value));
    }

    /// <summary>Gets or sets the colour of <see cref="CanopyTone.Warning"/>.</summary>
    /// <exception cref="ArgumentException">The value is not <c>#</c> followed by three or six hex digits.</exception>
    public string Warning {
        get => _warning;
        set => _warning = Require(value, nameof(value));
    }

    /// <summary>Gets or sets the colour of <see cref="CanopyTone.Danger"/>.</summary>
    /// <exception cref="ArgumentException">The value is not <c>#</c> followed by three or six hex digits.</exception>
    public string Danger {
        get => _danger;
        set => _danger = Require(value, nameof(value));
    }

    /// <summary>Returns whether a value is <c>#</c> followed by three or six hex digits.</summary>
    internal static bool IsHexColor(string? color) {
        if (color == null || (color.Length != 4 && color.Length != 7) || color[0] != '#') {
            return false;
        }

        for (var index = 1; index < color.Length; index++) {
            var ch = color[index];
            if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'))) {
                return false;
            }
        }

        return true;
    }

    private static string Require(string value, string parameter) =>
        IsHexColor(value) ? value : throw new ArgumentException("A colour of the static outline is # followed by three or six hex digits.", parameter);
}
