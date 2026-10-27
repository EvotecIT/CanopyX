using CanopyX.Json;

namespace CanopyX;

/// <summary>One raw or bucketed column of a tuple membership predicate.</summary>
public sealed class CanopyGridTupleColumn {
    /// <summary>Creates a tuple field.</summary>
    /// <param name="column">A declared filterable column.</param>
    /// <param name="bucket">An optional partition; tuple operands then are numeric keys.</param>
    public CanopyGridTupleColumn(string column, CanopyBucket? bucket = null) {
        CanopyIdentifiers.Require(column, nameof(column)); Column = column; Bucket = bucket;
    }
    /// <summary>Gets the column identity.</summary>
    public string Column { get; }
    /// <summary>Gets the optional partition.</summary>
    public CanopyBucket? Bucket { get; }
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("column", Column);
        if (Bucket != null) { writer.Name("bucket"); Bucket.WriteJson(writer); }
        writer.EndObject();
    }
}
