using System;
using System.Linq;
using System.Net;
using System.Text;

namespace CanopyX.Html;

internal static partial class CanopyHtmlWriter {
    /// <summary>
    /// A dataset element: hidden, never mounted, holding the dataset document and, for compact rows, its chunk scripts. With
    /// inline assets it also carries the part that decodes compact rows or reads rows from an address.
    /// </summary>
    internal static string Fragment(CanopyDataset dataset, CanopyHtmlOptions options) {
        if (dataset == null) throw new ArgumentNullException(nameof(dataset));
        var data = dataset.Kind == CanopyGridSourceKind.Inline && dataset.Url == null && ShouldWriteCompact(dataset, options.RowData)
            ? dataset.ToRowData(options.RowData) : null;
        var json = data == null ? dataset.ToJson() : dataset.ToJson(data);
        var builder = new StringBuilder(json.Length + 160);
        // The JSON writer escapes <, > and &, so the document cannot close the script element early.
        builder.Append("<div class=\"cx-dataset\" data-cx-dataset=\"").Append(WebUtility.HtmlEncode(dataset.Id)).Append("\" hidden>")
            .Append("<script type=\"application/json\" class=\"cx-config\">").Append(json).Append("</script>");
        for (var index = 0; data != null && index < data.ChunkCount; index++) {
            builder.Append("<script type=\"application/x-canopyx-rows\">").Append(data.GetChunk(index)).Append("</script>");
        }
        builder.Append("</div>");
        if (options.AssetMode != CanopyAssetMode.Inline) return builder.ToString();
        return builder + SharedParts(options, CanopyHtmlAssets.Parts.Where(part => data != null && part.Serves("rowData") || dataset.Url != null && part.Serves("urlRows")));
    }

    // The same choice a grid's own rows get: compact above the row threshold unless the host chose a format.
    private static bool ShouldWriteCompact(CanopyDataset dataset, CanopyRowDataOptions? options) =>
        (options?.Format ?? CanopyRowFormat.Auto) switch {
            CanopyRowFormat.Objects => false,
            CanopyRowFormat.Auto => dataset.Rows.Count > CanopyRowDataOptions.CompactAboveRows && !dataset.Rows.Any(row => row.Detail != null || row.HasFields),
            _ => true
        };
}
