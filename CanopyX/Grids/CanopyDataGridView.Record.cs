using System;
using System.Collections.Generic;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets the record panel: the rich record drawer with record-only fields, sections, tabs, a pinned summary,
    /// structured values, related records, deep links and actions. Null keeps the plain drawer of the columns.</summary>
    public CanopyRecordPanel? Record { get; set; }

    /// <summary>Checks the record panel and the rows' record fields against it.</summary>
    private void ValidateRecord() {
        var fields = Record?.Validate(Columns);
        foreach (var row in Rows) {
            if (row == null || !row.HasFields) continue;
            if (fields == null) throw new InvalidOperationException("Grid row '" + row.Id + "' has record fields, which need a record panel (Record).");
            foreach (var key in row.Fields.Keys) if (!fields.Contains(key)) throw new InvalidOperationException("Grid row '" + row.Id + "' has an undeclared record field '" + key + "'.");
        }
    }
}
