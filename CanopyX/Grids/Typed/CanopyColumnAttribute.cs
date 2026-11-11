using System;

namespace CanopyX;

/// <summary>
/// Sets how <see cref="CanopyDataGridView.From{T}(System.Collections.Generic.IEnumerable{T}, string, string, string)"/> writes a
/// property's column. A property of a type the automatic path skips (anything but text, numbers, booleans, dates, enumerations,
/// <see cref="Guid"/> and <see cref="TimeSpan"/>) becomes a text column when it carries this attribute.
/// </summary>
[AttributeUsage(AttributeTargets.Property, AllowMultiple = false, Inherited = true)]
public sealed class CanopyColumnAttribute : Attribute {
    /// <summary>Gets or sets the column title; by default the property name as words (<c>LastSeenUtc</c> is "Last seen utc").</summary>
    public string? Title { get; set; }

    /// <summary>Gets or sets the column position: columns are ordered by it (default 0), ties keep declaration order.</summary>
    public int Order { get; set; }

    /// <summary>Gets or sets whether the column starts hidden; the reader can still show it from the column menu.</summary>
    public bool Hidden { get; set; }

    /// <summary>
    /// Gets or sets a .NET format string (<c>N2</c>, <c>yyyy-MM-dd</c>, <c>0.0 'GB'</c>) applied with the invariant culture to
    /// write each cell's display text. The raw value still drives sorting, filtering and export.
    /// </summary>
    public string? Format { get; set; }
}
