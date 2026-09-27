using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A detail row that shows a small table, for example the settings that changed in a revision with before and after
/// values.
/// </summary>
public sealed class CanopyTableDetail : CanopyDetail {
    /// <summary>Creates a table detail.</summary>
    /// <param name="caption">An optional caption shown above the table and read by screen readers.</param>
    public CanopyTableDetail(string? caption = null) {
        Caption = caption;
    }

    /// <summary>Gets or sets the caption shown above the table.</summary>
    public string? Caption { get; set; }

    /// <summary>Gets the column headers.</summary>
    public IList<string> Columns { get; } = new List<string>();

    /// <summary>Gets the rows; each row holds one cell per column.</summary>
    public IList<IList<CanopyCell>> Rows { get; } = new List<IList<CanopyCell>>();

    /// <summary>Adds column headers.</summary>
    /// <param name="titles">The header texts, in order.</param>
    /// <returns>This detail, for chaining.</returns>
    public CanopyTableDetail AddColumns(params string[] titles) {
        foreach (var title in titles ?? Array.Empty<string>()) {
            Columns.Add(title ?? string.Empty);
        }

        return this;
    }

    /// <summary>Adds a row.</summary>
    /// <param name="cells">One cell per column.</param>
    /// <returns>This detail, for chaining.</returns>
    /// <exception cref="ArgumentException">The number of cells differs from the number of columns.</exception>
    public CanopyTableDetail AddRow(params CanopyCell[] cells) {
        if (cells == null || cells.Length != Columns.Count) {
            throw new ArgumentException("A table row needs one cell per column (" + Columns.Count + ").", nameof(cells));
        }

        Rows.Add(new List<CanopyCell>(cells));
        return this;
    }

    internal override string Type => "table";

    internal override int AutomaticHeight => Math.Min(16, Rows.Count + (Caption == null ? 1 : 2));

    internal override void WriteContent(CanopyJsonWriter writer) {
        writer.OptionalProperty("caption", Caption);
        foreach (var column in Columns) {
            if (column == null) {
                throw new InvalidOperationException("A table detail cannot have a null column header.");
            }
        }

        writer.StringArray("columns", Columns);
        writer.Name("rows").BeginArray();
        foreach (var row in Rows) {
            if (row.Count != Columns.Count) {
                throw new InvalidOperationException("A table detail row has " + row.Count + " cells but the table has " + Columns.Count + " columns.");
            }

            writer.BeginArray();
            foreach (var cell in row) {
                if (cell == null) {
                    writer.Null();
                } else {
                    cell.WriteJson(writer);
                }
            }

            writer.EndArray();
        }

        writer.EndArray();
    }
}
