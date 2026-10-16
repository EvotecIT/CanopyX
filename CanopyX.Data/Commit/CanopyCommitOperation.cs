namespace CanopyX.Data;

/// <summary>What a row of a commit asks for (<see cref="CanopyCommitRow.Operation"/>).</summary>
public enum CanopyCommitOperation {
    /// <summary>Changes the columns of an existing record (<c>"op": "update"</c>, the default). The row carries its original values.</summary>
    Update = 0,

    /// <summary>Adds a new record (<c>"op": "insert"</c>): the row's id is the client's temporary id, its values are every value of
    /// the new record, and it has no original values. A saved insert may answer the stored identity (<see cref="CanopyCommitRowResult.NewId"/>).</summary>
    Insert
}
