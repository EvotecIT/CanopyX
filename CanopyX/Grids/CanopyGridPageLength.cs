using System;

namespace CanopyX;

/// <summary>A page-size choice of a paged grid's pager: a number of rows, or every row of inline data, with an optional label.</summary>
/// <remarks>An integer converts implicitly, so <c>pager.PageLengths.Add(25)</c> adds a choice of 25 rows.</remarks>
public sealed class CanopyGridPageLength {
    private CanopyGridPageLength(int? length, string? label) {
        if (label != null && (string.IsNullOrWhiteSpace(label) || label.Length > 64))
            throw new ArgumentException("A page-size label has 1 to 64 characters with visible text.", nameof(label));
        Length = length;
        Label = label;
    }

    /// <summary>Gets the number of rows a page shows, or null for every row (<see cref="IsAll"/>).</summary>
    public int? Length { get; }

    /// <summary>Gets whether this choice shows every row. Only inline sources offer it.</summary>
    public bool IsAll => Length == null;

    /// <summary>Gets the text the menu shows, or null for the formatted number (or the translated <see cref="CanopyLabels.GridAll"/>).</summary>
    public string? Label { get; }

    /// <summary>Creates a choice of a number of rows.</summary>
    /// <param name="length">Rows per page, from 1 to 10,000.</param>
    /// <param name="label">Optional menu text; null shows the formatted number.</param>
    /// <returns>The choice.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="length"/> is outside 1 to 10,000.</exception>
    public static CanopyGridPageLength Rows(int length, string? label = null) {
        if (length < 1 || length > 10000) throw new ArgumentOutOfRangeException(nameof(length), length, "A page shows 1 to 10,000 rows.");
        return new CanopyGridPageLength(length, label);
    }

    /// <summary>Creates the choice that shows every row of inline data.</summary>
    /// <param name="label">Optional menu text; null shows the translated <see cref="CanopyLabels.GridAll"/>.</param>
    /// <returns>The choice.</returns>
    public static CanopyGridPageLength All(string? label = null) => new CanopyGridPageLength(null, label);

    /// <summary>Converts a number of rows to a choice without a label.</summary>
    /// <param name="length">Rows per page, from 1 to 10,000.</param>
    public static implicit operator CanopyGridPageLength(int length) => Rows(length);
}
