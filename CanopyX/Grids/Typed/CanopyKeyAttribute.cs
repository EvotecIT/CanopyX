using System;

namespace CanopyX;

/// <summary>
/// Marks the property whose value identifies each record when <see cref="CanopyDataGridView.From{T}(System.Collections.Generic.IEnumerable{T}, string, string, string)"/>
/// builds a grid without an explicit key. Integer values are written as invariant digits, other values as invariant text.
/// </summary>
/// <remarks>A record type has at most one key. The key property is still a column unless it also carries <see cref="CanopyIgnoreAttribute"/>.</remarks>
[AttributeUsage(AttributeTargets.Property, AllowMultiple = false, Inherited = true)]
public sealed class CanopyKeyAttribute : Attribute {
}
