namespace CanopyX.Data;

/// <summary>A mapped record field (or a column's drawer value): its identity and how it is read.</summary>
internal abstract class RecordFieldMap<T> {
    protected RecordFieldMap(string id) { Id = id; }

    internal string Id { get; }
}
