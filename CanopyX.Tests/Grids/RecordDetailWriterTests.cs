using System;
using System.Collections.Generic;
using System.IO;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Every definition-aware row writer checks live and loaded nested details against the same schema.</summary>
public sealed class RecordDetailWriterTests {
    public static IEnumerable<object[]> PayloadCases() {
        foreach (var transport in new[] { "record", "sidecar" })
            foreach (var detail in new[] { "grid", "deepGrid", "tree" })
                yield return new object[] { transport, detail };
    }

    [Theory]
    [MemberData(nameof(PayloadCases))]
    public void RowWriters_RejectUndeclaredNestedCellsLikeInlineRows(string transport, string detail) {
        var (view, row, invalidate) = NestedDetailFixture.Create(detail);
        Assert.Contains("\"id\":\"child\"", Write(transport, view, row));
        invalidate();
        view.Rows.Add(row);
        Assert.Contains("undeclared", Assert.Throws<InvalidOperationException>(() => view.ToJson()).Message);
        view.Rows.Clear();
        Assert.Contains("undeclared", Assert.Throws<InvalidOperationException>(() => Write(transport, view, row)).Message);
    }

    private static string Write(string transport, CanopyDataGridView view, CanopyGridRow row) {
        var record = new CanopyGridRecord(row.Id) { Row = row };
        if (transport == "record") return record.ToJson(view);
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-detail-writer-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try {
            var files = CanopyRecordSidecar.Write(directory, view, new[] { record });
            return File.ReadAllText(Path.Combine(directory, Assert.Single(files)));
        } finally { Directory.Delete(directory, true); }
    }
}
