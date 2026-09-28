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

    internal static string ToneColor(CanopyTone tone) => tone switch {
        CanopyTone.Info => "#0550ae",
        CanopyTone.Success => "#116329",
        CanopyTone.Warning => "#7d4e00",
        CanopyTone.Danger => "#b3261e",
        CanopyTone.Muted => "#59636e",
        _ => string.Empty
    };

    internal static string Badge(CanopyTone tone) {
        var (background, color) = tone switch {
            CanopyTone.Info => ("#ddf4ff", "#0550ae"),
            CanopyTone.Success => ("#dafbe1", "#116329"),
            CanopyTone.Warning => ("#fff8c5", "#7d4e00"),
            CanopyTone.Danger => ("#ffebe9", "#b3261e"),
            CanopyTone.Muted => ("#f6f8fa", "#59636e"),
            _ => ("#f6f8fa", "#1f2328")
        };
        return "display:inline-block;margin-left:6px;padding:0 6px;border:1px solid #d1d9e0;border-radius:9px;font-size:11px;background:" + background + ";color:" + color + ";";
    }
}
