using System;
using System.Collections.Generic;
using System.IO;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Every definition-aware row writer checks live and loaded nested details against the same schema.</summary>
public sealed class GridDetailWriterTests {
    public static IEnumerable<object[]> PayloadCases() {
        foreach (var transport in new[] { "add", "update" })
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
        if (transport == "add" || transport == "update") {
            var transaction = new CanopyGridTransaction();
            (transport == "add" ? transaction.Add : transaction.Update).Add(row);
            return transaction.ToJson(view);
        }
        throw new ArgumentException("Unknown transaction transport.", nameof(transport));
    }
}
