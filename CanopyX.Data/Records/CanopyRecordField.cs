using System;

namespace CanopyX.Data;

/// <summary>A record field a record endpoint serves: a value (text, number, date, link, timeline, change list) or a
/// collection, whose rows page with <c>gridRecordQuery</c> <c>field</c>, <c>offset</c> and <c>limit</c>.</summary>
/// <remarks>The identity must be one of the view's record panel fields (<see cref="CanopyRecordPanel.Fields"/>).</remarks>
public sealed class CanopyRecordField {
    private CanopyRecordField(string id, bool collection, int pageSize) {
        if (id == null) throw new ArgumentNullException(nameof(id));
        if (id.Length == 0 || id.Length > 4096) throw new ArgumentException("A field identity has 1 to 4,096 characters.", nameof(id));
        if (collection && (pageSize < 1 || pageSize > 10000)) throw new ArgumentOutOfRangeException(nameof(pageSize), pageSize, "A collection page holds 1 to 10,000 rows.");
        Id = id;
        IsCollection = collection;
        PageSize = collection ? pageSize : 0;
    }

    /// <summary>Gets the record field identity.</summary>
    public string Id { get; }

    /// <summary>Gets whether the field is a collection whose rows page.</summary>
    public bool IsCollection { get; }

    /// <summary>Gets the rows a collection answers with in a whole record, and asks for with Load more (capped by
    /// <see cref="CanopyRemoteLimits.MaxRecordPageSize"/>); zero for a value field.</summary>
    public int PageSize { get; }

    /// <summary>A value field: a scalar, a link, a timeline or a change list, answered whole.</summary>
    /// <param name="id">The record panel field identity.</param>
    /// <returns>The field.</returns>
    public static CanopyRecordField Value(string id) => new CanopyRecordField(id, false, 0);

    /// <summary>A collection field whose rows page.</summary>
    /// <param name="id">The record panel field identity.</param>
    /// <param name="pageSize">The rows of a page, 1 to 10,000. Default 50, the record panel's default.</param>
    /// <returns>The field.</returns>
    public static CanopyRecordField Collection(string id, int pageSize = 50) => new CanopyRecordField(id, true, pageSize);
}
