using System;

namespace CanopyX.Data;

/// <summary>Safety limits applied to every remote request before it reaches a data provider.</summary>
/// <remarks>
/// Defaults are conservative. Protocol bounds cap each limit: a page holds at most 10,000 rows, a filter has at most
/// eight group levels, 64 groups and 64 predicates, a membership test at most 1,000 values, and a value list at most 200
/// buckets. Setting a limit above its protocol bound throws.
/// </remarks>
public sealed class CanopyRemoteLimits {
    private int _maxPageSize = 1000;
    private int _maxExportRows = 100000;
    private int _maxFilterDepth = 8;
    private int _maxFilterTerms = 64;
    private int _maxFilterGroups = 64;
    private int _maxInValues = 1000;
    private int _maxValueListSize = 200;
    private int _maxSearchLength = 1024;
    private int _maxSearchTerms = 16;
    private int _maxOperandLength = 4096;
    private int _maxRequestBytes = 1048576;
    private int _maxSelectedIds = 10000;
    private int _maxGroups = 10000;
    private int _maxCommitRows = 100;
    private int _maxCommitTextLength = 65536;
    private int _maxRecordPageSize = 200;
    private int _maxRecordItems = 200;
    private int _maxRecordBytes = 1048576;
    private int _maxRecordTextLength = 8192;
    private int _maxRecordOffset = 10000;
    private int _maxRecordRequestBytes = 16384;

    /// <summary>Gets or sets the largest page a client may request, from 1 to 10,000. Default 1,000.</summary>
    public int MaxPageSize { get => _maxPageSize; set => _maxPageSize = Check(value, 1, 10000, nameof(MaxPageSize)); }

    /// <summary>Gets or sets the most rows one export may write. Larger scopes are rejected before any byte is written. Default 100,000.</summary>
    public int MaxExportRows { get => _maxExportRows; set => _maxExportRows = Check(value, 1, int.MaxValue - 1, nameof(MaxExportRows)); }

    /// <summary>Gets or sets the deepest nesting of filter groups, from 1 to 8. Default 8.</summary>
    public int MaxFilterDepth { get => _maxFilterDepth; set => _maxFilterDepth = Check(value, 1, 8, nameof(MaxFilterDepth)); }

    /// <summary>Gets or sets the most predicates in one query, flat and nested together, from 1 to 64. Default 64.</summary>
    public int MaxFilterTerms { get => _maxFilterTerms; set => _maxFilterTerms = Check(value, 1, 64, nameof(MaxFilterTerms)); }

    /// <summary>Gets or sets the most filter groups in one query, from 1 to 64. Default 64.</summary>
    public int MaxFilterGroups { get => _maxFilterGroups; set => _maxFilterGroups = Check(value, 1, 64, nameof(MaxFilterGroups)); }

    /// <summary>Gets or sets the most operands of one membership (<c>in</c>) predicate, from 1 to 1,000. Default 1,000.</summary>
    public int MaxInValues { get => _maxInValues; set => _maxInValues = Check(value, 1, 1000, nameof(MaxInValues)); }

    /// <summary>Gets or sets the most buckets one value list may return, from 1 to 200. Default 200.</summary>
    public int MaxValueListSize { get => _maxValueListSize; set => _maxValueListSize = Check(value, 1, 200, nameof(MaxValueListSize)); }

    /// <summary>Gets or sets the longest quick-search or value-list search text in UTF-16 code units, from 1 to 16,384. Default 1,024.</summary>
    public int MaxSearchLength { get => _maxSearchLength; set => _maxSearchLength = Check(value, 1, 16384, nameof(MaxSearchLength)); }

    /// <summary>Gets or sets the most words and quoted phrases in an all-words quick search, from 1 to 64. Default 16.</summary>
    /// <remarks>Each term is matched against every searchable column, so the term count multiplies the predicates a database evaluates.</remarks>
    public int MaxSearchTerms { get => _maxSearchTerms; set => _maxSearchTerms = Check(value, 1, 64, nameof(MaxSearchTerms)); }

    /// <summary>Gets or sets the longest text operand in UTF-16 code units, from 1 to 65,536. Default 4,096.</summary>
    public int MaxOperandLength { get => _maxOperandLength; set => _maxOperandLength = Check(value, 1, 65536, nameof(MaxOperandLength)); }

    /// <summary>Gets or sets the largest request body in bytes, from 1 KiB to 16 MiB. Default 1 MiB.</summary>
    public int MaxRequestBytes { get => _maxRequestBytes; set => _maxRequestBytes = Check(value, 1024, 16777216, nameof(MaxRequestBytes)); }

    /// <summary>Gets or sets the most explicit record identities in a selected export or exclusion list, from 1 to 10,000. Default 10,000.</summary>
    public int MaxSelectedIds { get => _maxSelectedIds; set => _maxSelectedIds = Check(value, 1, 10000, nameof(MaxSelectedIds)); }

    /// <summary>Gets or sets the most groups one grouped summary may return, across all its levels, from 1 to 10,000. Default 10,000.</summary>
    public int MaxGroups { get => _maxGroups; set => _maxGroups = Check(value, 1, 10000, nameof(MaxGroups)); }

    /// <summary>Gets or sets the most rows one commit may change, from 1 to 10,000. Larger batches are rejected before any row is written. Default 100.</summary>
    public int MaxCommitRows { get => _maxCommitRows; set => _maxCommitRows = Check(value, 1, 10000, nameof(MaxCommitRows)); }

    /// <summary>Gets or sets the longest text value a commit may write, in UTF-16 code units, from 1 to 1,048,576. Default 65,536.</summary>
    /// <remarks>A column's <see cref="CanopyCellValidation.MaxLength"/> narrows it further; <see cref="MaxRequestBytes"/> bounds the whole body.</remarks>
    public int MaxCommitTextLength { get => _maxCommitTextLength; set => _maxCommitTextLength = Check(value, 1, 1048576, nameof(MaxCommitTextLength)); }

    /// <summary>Gets or sets the most rows of one collection a record answer holds, from 1 to 10,000: the rows of a collection
    /// page (<c>limit</c>), and the first rows of each collection in a whole record. Default 200.</summary>
    /// <remarks>A collection page that asks for more is rejected; a collection whose declared page size is larger answers with
    /// this many first rows and its total, so the record panel offers Load more.</remarks>
    public int MaxRecordPageSize { get => _maxRecordPageSize; set => _maxRecordPageSize = Check(value, 1, 10000, nameof(MaxRecordPageSize)); }

    /// <summary>Gets or sets the most timeline events or changes one record field holds, from 1 to 10,000. Default 200.</summary>
    /// <remarks>A timeline or change list answers with its first events (newest first by default) up to the smaller of this
    /// limit and the field's own limit. Change lists are capped at 512 changes by the protocol.</remarks>
    public int MaxRecordItems { get => _maxRecordItems; set => _maxRecordItems = Check(value, 1, 10000, nameof(MaxRecordItems)); }

    /// <summary>Gets or sets the largest serialized record answer in UTF-8 bytes, from 1 KiB to 64 MiB. Default 1 MiB.</summary>
    /// <remarks>An answer that would be larger is refused with <see cref="CanopyRequestError.LimitExceeded"/>, never cut short:
    /// a truncated record would look complete.</remarks>
    public int MaxRecordBytes { get => _maxRecordBytes; set => _maxRecordBytes = Check(value, 1024, 67108864, nameof(MaxRecordBytes)); }

    /// <summary>Gets or sets the longest text value a record answer carries, in UTF-16 code units, from 16 to 1,048,576. Default 8,192.</summary>
    /// <remarks>Longer text in record fields, drawer values, collection cells, timelines and changes is shortened so that it
    /// ends with an ellipsis (…) and, ellipsis included, fits this length, never inside a surrogate pair; databases read at
    /// most one character more than the limit. The endpoint applies the bound to every record provider's answer, custom ones
    /// included. Identities, link keys and the record's row (written as page rows are) are never shortened.
    /// <see cref="MaxRecordBytes"/> still bounds the whole answer: answers are built before they are measured, so the largest
    /// answer a record endpoint builds grows with this length times the mapped collections' rows and columns.</remarks>
    public int MaxRecordTextLength { get => _maxRecordTextLength; set => _maxRecordTextLength = Check(value, 16, 1048576, nameof(MaxRecordTextLength)); }

    /// <summary>Gets or sets the largest offset of a collection page, from 0 to 10,000,000. Default 10,000.</summary>
    /// <remarks>An offset costs its distance in the store; deeper pages are rejected with <see cref="CanopyRequestError.LimitExceeded"/>.</remarks>
    public int MaxRecordOffset { get => _maxRecordOffset; set => _maxRecordOffset = Check(value, 0, 10000000, nameof(MaxRecordOffset)); }

    /// <summary>Gets or sets the largest record request body in bytes, from 1 KiB to 1 MiB, within <see cref="MaxRequestBytes"/>. Default 16 KiB.</summary>
    /// <remarks>A <c>gridRecordQuery</c> carries an identity, a revision and a field name, so it needs far less than a query.</remarks>
    public int MaxRecordRequestBytes { get => _maxRecordRequestBytes; set => _maxRecordRequestBytes = Check(value, 1024, 1048576, nameof(MaxRecordRequestBytes)); }

    private static int Check(int value, int minimum, int maximum, string name) {
        if (value < minimum || value > maximum) throw new ArgumentOutOfRangeException(name, value, "The limit must be from " + minimum + " to " + maximum + ".");
        return value;
    }
}
