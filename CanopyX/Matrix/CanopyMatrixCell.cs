using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>The state of one row and column of a matrix, with an optional value, short text and details.</summary>
public sealed class CanopyMatrixCell {
    /// <summary>Creates a cell.</summary>
    /// <param name="row">The row item's id.</param>
    /// <param name="column">The column item's id.</param>
    /// <param name="state">The state's id.</param>
    public CanopyMatrixCell(string row, string column, string state) {
        Row = row;
        Column = column;
        State = state;
    }

    /// <summary>Gets the row item's id.</summary>
    public string Row { get; }

    /// <summary>Gets the column item's id.</summary>
    public string Column { get; }

    /// <summary>Gets or sets the state's id.</summary>
    public string State { get; set; }

    /// <summary>Gets or sets a number the cell shows beside its symbol, such as a count of errors. It changes no sort or total. Finite.</summary>
    public double? Value { get; set; }

    /// <summary>Gets or sets short text the cell shows instead of its value, such as "3 errors". At most 64 characters.</summary>
    public string? Text { get; set; }

    /// <summary>Gets or sets a longer explanation for the tooltip and the details dialog. At most 1,000 characters.</summary>
    public string? Title { get; set; }

    /// <summary>Gets label and value pairs the details dialog lists, at most 16.</summary>
    public IList<KeyValuePair<string, string>> Details { get; } = new List<KeyValuePair<string, string>>();

    /// <summary>Adds a detail and returns the cell, for chaining.</summary>
    /// <param name="label">The label: at most 200 characters.</param>
    /// <param name="value">The value: at most 1,000 characters.</param>
    /// <returns>The cell.</returns>
    public CanopyMatrixCell Detail(string label, string value) {
        Details.Add(new KeyValuePair<string, string>(label, value));
        return this;
    }
}
