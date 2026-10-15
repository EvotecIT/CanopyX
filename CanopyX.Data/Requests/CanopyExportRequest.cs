using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>A validated export request: the record scope, the columns in order and how values are written.</summary>
/// <remarks>
/// <see cref="Query"/> is the effective record query of the scope: filtered exports keep search and filters, selected
/// exports restrict to identities (or keep an all-matching selection's criteria and exclusions), and all exports clear
/// the criteria. Each keeps the accepted sort keys. The window starts at zero; its limit is the export row cap plus one.
/// </remarks>
public sealed class CanopyExportRequest {
    internal CanopyExportRequest(CanopyExportScope scope, CanopyDataRequest query, IList<CanopyDataColumn> columns, bool rawValues,
        string revision, int? recordCount, string? fileName, string? locale, CanopyTimeZone timeZone) {
        Scope = scope;
        Query = query;
        Columns = new ReadOnlyCollection<CanopyDataColumn>(columns);
        RawValues = rawValues;
        Revision = revision;
        RecordCount = recordCount;
        FileName = fileName;
        Locale = locale;
        TimeZone = timeZone;
    }

    /// <summary>Gets the record scope.</summary>
    public CanopyExportScope Scope { get; }

    /// <summary>Gets the effective record query of the scope.</summary>
    public CanopyDataRequest Query { get; }

    /// <summary>Gets the exported columns in order.</summary>
    public IReadOnlyList<CanopyDataColumn> Columns { get; }

    /// <summary>Gets whether raw typed values are written (true) or display text (false).</summary>
    public bool RawValues { get; }

    /// <summary>Gets the dataset revision the export was captured from.</summary>
    public string Revision { get; }

    /// <summary>Gets the record count the client captured, or null when unknown.</summary>
    public int? RecordCount { get; }

    /// <summary>Gets the suggested file name without extension, or null.</summary>
    public string? FileName { get; }

    /// <summary>Gets the captured locale for display formatting, or null.</summary>
    public string? Locale { get; }

    /// <summary>Gets the captured display time zone.</summary>
    public CanopyTimeZone TimeZone { get; }

    internal CanopyExportRequest WithQuery(CanopyDataRequest query) {
        if (query == null) throw new ArgumentNullException(nameof(query));
        return new CanopyExportRequest(Scope, query, new List<CanopyDataColumn>(Columns), RawValues, Revision, RecordCount, FileName, Locale, TimeZone);
    }
}
