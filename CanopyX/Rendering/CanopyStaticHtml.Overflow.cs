using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>The common overflow row for outer and recursive nested views. Notes and links remain outside
    /// captured data/detail text; every link uses the same script-free URL check.</summary>
    private static void AppendOverflow(StringBuilder html, int shown, long? total, int columns,
        CanopyStaticHtmlOptions settings, CanopyStaticStyles styles, CanopyLabels labels) {
        html.Append("<tr><td colspan=\"").Append(columns).Append("\" style=\"").Append(styles.Note).Append("\">");
        AppendOverflowContent(html, shown, total, settings, styles, labels);
        html.Append("</td></tr>");
    }

    /// <summary>Shared overflow text and safe report link, independent of the view's table or card layout.</summary>
    private static void AppendOverflowContent(StringBuilder html, int shown, long? total,
        CanopyStaticHtmlOptions settings, CanopyStaticStyles styles, CanopyLabels labels) {
        var note = (settings.OverflowNote ?? labels.OverflowNote).Replace("{shown}", shown.ToString("N0", settings.Culture))
            .Replace("{total}", total.HasValue ? total.Value.ToString("N0", settings.Culture) : labels.UnknownTotal);
        html.Append(Encode(note));
        if (IsSafeReportUrl(settings.FullReportUrl)) {
            html.Append(" <a href=\"").Append(Encode(settings.FullReportUrl!)).Append("\" style=\"").Append(styles.Link).Append("\">")
                .Append(Encode(settings.FullReportText ?? labels.FullReport)).Append("</a>");
        }
    }
}
