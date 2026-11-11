using System;

namespace CanopyX;

/// <summary>Leaves a property out of the columns <see cref="CanopyDataGridView.From{T}(System.Collections.Generic.IEnumerable{T}, string, string, string)"/> derives.</summary>
[AttributeUsage(AttributeTargets.Property, AllowMultiple = false, Inherited = true)]
public sealed class CanopyIgnoreAttribute : Attribute {
}
