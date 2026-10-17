using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX.Data;

/// <summary>What an export format writes: the validated request, its ordered records and value formatting.</summary>
public sealed class CanopyExportContext {
    internal CanopyExportContext(CanopyExportRequest request, IAsyncEnumerable<CanopyGridRow> records, int recordCount) {
        Request = request;
        Records = records;
        RecordCount = recordCount;
        Culture = request.Locale == null ? CultureInfo.InvariantCulture : CultureInfo.GetCultureInfo(request.Locale);
    }

    /// <summary>Gets the validated request.</summary>
    public CanopyExportRequest Request { get; }

    /// <summary>Gets the exported columns in order.</summary>
    public IReadOnlyList<CanopyDataColumn> Columns => Request.Columns;

    /// <summary>Gets the ordered records. Enumerate once.</summary>
    public IAsyncEnumerable<CanopyGridRow> Records { get; }

    /// <summary>Gets the number of records the export contains, counted before writing started.</summary>
    public int RecordCount { get; }

    /// <summary>Gets the culture for display formatting: the request's locale, or the invariant culture.</summary>
    public CultureInfo Culture { get; }

    /// <summary>Gets the normalized raw value of a record's cell.</summary>
    /// <param name="row">The record.</param>
    /// <param name="column">The column.</param>
    /// <returns>The raw value, or null when missing.</returns>
    public object? GetValue(CanopyGridRow row, CanopyDataColumn column) {
        if (row == null) throw new ArgumentNullException(nameof(row));
        if (column == null) throw new ArgumentNullException(nameof(column));
        return row.Cells.TryGetValue(column.Id, out var cell) && cell != null ? CanopyDataValues.Normalize(cell.Value) : null;
    }

    /// <summary>Gets the text a record's cell exports as: raw values in invariant form, or display text.</summary>
    /// <param name="row">The record.</param>
    /// <param name="column">The column.</param>
    /// <returns>The text; empty for a missing value.</returns>
    /// <remarks>
    /// Display text is the cell's own text when the server supplied one; otherwise numbers use the request culture with up
    /// to three decimals, dates <c>yyyy-MM-dd HH:mm UTC</c> and booleans <c>Yes</c> or <c>No</c>. The server cannot know a
    /// reader's local time zone, so local-time requests also receive UTC.
    /// </remarks>
    public string GetText(CanopyGridRow row, CanopyDataColumn column) {
        if (row == null) throw new ArgumentNullException(nameof(row));
        if (column == null) throw new ArgumentNullException(nameof(column));
        row.Cells.TryGetValue(column.Id, out var cell);
        if (!Request.RawValues && cell?.Text != null) return cell.Text;
        var value = cell == null ? null : CanopyDataValues.Normalize(cell.Value);
        if (Request.RawValues) return CanopyDataValues.ToSearchText(value) ?? string.Empty;
        return value switch {
            null => string.Empty,
            bool flag => flag ? "Yes" : "No",
            DateTime date => date.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + " UTC",
            string text => text,
            var number => CanopyDataValues.ToDouble(number).ToString("#,0.###", Culture)
        };
    }
}
