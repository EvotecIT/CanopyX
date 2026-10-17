using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>The built-in CSV writer: UTF-8 with a byte order mark, CRLF lines, quoted fields and formula protection.</summary>
/// <remarks>
/// The first line holds the column titles. A field is quoted when it contains the delimiter, a quote or a line break.
/// Text starting with a tab or carriage return, or with a spreadsheet formula prefix (<c>=</c>, <c>+</c>, <c>-</c>,
/// <c>@</c> or their full-width forms after optional leading whitespace), gets an apostrophe; raw numbers stay numeric.
/// The output is flushed in blocks while records are read.
/// </remarks>
public sealed class CanopyCsvExportFormat : ICanopyExportFormat {
    private readonly char _delimiter;

    /// <summary>Creates a CSV writer.</summary>
    /// <param name="delimiter">The field delimiter: comma (default), semicolon or tab.</param>
    public CanopyCsvExportFormat(char delimiter = ',') {
        if (delimiter != ',' && delimiter != ';' && delimiter != '\t') throw new ArgumentOutOfRangeException(nameof(delimiter), "Use a comma, semicolon or tab.");
        _delimiter = delimiter;
    }

    /// <inheritdoc />
    public string Id => "csv";

    /// <inheritdoc />
    public string ContentType => "text/csv; charset=utf-8";

    /// <inheritdoc />
    public string Extension => "csv";

    /// <inheritdoc />
    public async Task WriteAsync(CanopyExportContext context, Stream output, CancellationToken cancellationToken) {
        if (context == null) throw new ArgumentNullException(nameof(context));
        if (output == null) throw new ArgumentNullException(nameof(output));
        var writer = new StreamWriter(output, new UTF8Encoding(true), 65536);
        var line = new StringBuilder(256);
        for (var i = 0; i < context.Columns.Count; i++) {
            if (i > 0) line.Append(_delimiter);
            Append(line, context.Columns[i].Title, false);
        }
        line.Append("\r\n");
        await writer.WriteAsync(line.ToString()).ConfigureAwait(false);
        var pending = 0;
        await foreach (var row in context.Records.WithCancellation(cancellationToken).ConfigureAwait(false)) {
            line.Clear();
            for (var i = 0; i < context.Columns.Count; i++) {
                if (i > 0) line.Append(_delimiter);
                var column = context.Columns[i];
                var value = context.Request.RawValues ? context.GetValue(row, column) : null;
                var numeric = value is long || value is double || value is decimal;
                Append(line, context.GetText(row, column), numeric);
            }
            line.Append("\r\n");
            await writer.WriteAsync(line.ToString()).ConfigureAwait(false);
            if (++pending == 1000) {
                pending = 0;
                await writer.FlushAsync().ConfigureAwait(false);
            }
        }
        await writer.FlushAsync().ConfigureAwait(false);
    }

    private void Append(StringBuilder line, string text, bool numeric) {
        if (!numeric && StartsFormula(text)) text = "'" + text;
        if (text.IndexOf(_delimiter) >= 0 || text.IndexOf('"') >= 0 || text.IndexOf('\r') >= 0 || text.IndexOf('\n') >= 0) {
            line.Append('"').Append(text.Replace("\"", "\"\"")).Append('"');
        } else {
            line.Append(text);
        }
    }

    private static bool StartsFormula(string text) {
        if (text.Length > 0 && (text[0] == '\t' || text[0] == '\r')) return true;
        foreach (var unit in text) {
            if (char.IsWhiteSpace(unit) || unit == '﻿') continue;
            return unit == '=' || unit == '+' || unit == '-' || unit == '@' || unit == '\uFF1D' || unit == '\uFF0B' || unit == '\uFF0D' || unit == '\uFF20';
        }
        return false;
    }
}
