using System;

namespace CanopyX.Rendering;

/// <summary>
/// Inline styles for the static outline. Email clients drop stylesheets and ignore CSS custom properties, so every
/// colour is a literal matching the light theme of the browser runtime.
/// </summary>
internal static class CanopyStaticStyles {
    internal const string Table = "border-collapse:collapse;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:#1f2328;";
    internal const string Caption = "text-align:left;font-weight:600;font-size:14px;padding:0 0 6px 0;";
    internal const string Header = "text-align:left;font-weight:600;padding:4px 8px;border-bottom:1px solid #8c959f;background:#f6f8fa;white-space:nowrap;";
    internal const string Cell = "padding:3px 8px;border-bottom:1px solid #d1d9e0;vertical-align:top;";
    internal const string Detail = "padding:4px 8px 6px 8px;border-bottom:1px solid #d1d9e0;background:#f6f8fa;";
    internal const string InnerTable = "border-collapse:collapse;font-size:12px;";
    internal const string InnerHeader = "text-align:left;font-weight:600;padding:2px 6px;border-bottom:1px solid #8c959f;";
    internal const string InnerCell = "padding:2px 6px;border-bottom:1px solid #d1d9e0;vertical-align:top;";
    internal const string Note = "margin:6px 0 0 0;font-size:12px;color:#59636e;";
    internal const string Link = "color:#0a58ca;";
    internal const string Hidden = "color:#59636e;font-weight:400;font-size:11px;";

    /// <summary>The <c>color</c> declaration of a toned cell, or an empty string for a tone without a colour.</summary>
    internal static string ToneColor(CanopyTone tone, CanopyStaticHtmlOptions options) {
        var color = Text(tone, options);
        return color == null ? string.Empty : "color:" + color + ";";
    }

    internal static string Badge(CanopyTone tone, CanopyStaticHtmlOptions options) {
        var background = tone.Name switch {
            "info" => "#ddf4ff",
            "success" => "#dafbe1",
            "warning" => "#fff8c5",
            "danger" => "#ffebe9",
            _ => "#f6f8fa"
        };
        return "display:inline-block;margin-left:6px;padding:0 6px;border:1px solid #d1d9e0;border-radius:9px;font-size:11px;background:" + background + ";color:" + (Text(tone, options) ?? "#1f2328") + ";";
    }

    /// <summary>The text colour of a tone: a literal for the tones CanopyX ships, the host's colour for its own.</summary>
    private static string? Text(CanopyTone tone, CanopyStaticHtmlOptions options) {
        switch (tone.Name) {
            case null:
            case "neutral":
                return null;
            case "info":
                return "#0550ae";
            case "success":
                return "#116329";
            case "warning":
                return "#7d4e00";
            case "danger":
                return "#b3261e";
            case "muted":
                return "#59636e";
            default:
                if (!options.ToneColors.TryGetValue(tone, out var color)) {
                    return null;
                }

                if (!IsHexColor(color)) {
                    throw new InvalidOperationException("The colour of tone '" + tone.Name + "' must be # followed by three or six hex digits.");
                }

                return color;
        }
    }

    private static bool IsHexColor(string? color) {
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
}
