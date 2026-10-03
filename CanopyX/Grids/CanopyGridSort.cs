using CanopyX.Json;

namespace CanopyX;

/// <summary>One ordered sort key of a flat-grid query.</summary>
public sealed class CanopyGridSort {
    /// <summary>Creates a sort key.</summary>
    /// <param name="column">The declared sortable column identity.</param>
    /// <param name="descending">True for descending order.</param>
    public CanopyGridSort(string column, bool descending = false) {
        CanopyIdentifiers.Require(column, nameof(column));
        Column = column;
        Descending = descending;
    }

    /// <summary>Gets the column identity.</summary>
    public string Column { get; }

    /// <summary>Gets whether this key sorts descending.</summary>
    public bool Descending { get; }

    internal void WriteJson(CanopyJsonWriter writer) => writer.BeginObject()
        .Property("column", Column).Property("direction", Descending ? "desc" : "asc").EndObject();
}
