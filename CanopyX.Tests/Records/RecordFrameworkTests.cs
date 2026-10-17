using System.Text;
using Xunit;

namespace CanopyX.Tests.Records;

/// <summary>Record panel output that depends on the platform's text and date handling, run on .NET and .NET Framework.</summary>
public sealed class RecordFrameworkTests {
    [Fact]
    public void StructuredValuesAndRecordDocuments_WriteTheSameTextOnEveryFramework() {
        var view = new CanopyDataGridView("certs", "Certificates") { Record = new CanopyRecordPanel { DeepLink = true, Source = CanopyRecordSource.Sidecar("records/", 8) } };
        view.Columns.Add(new CanopyColumn("cn", "Common name"));
        view.Columns.Add(new CanopyColumn("names", "Names") { Presenter = CanopyGridPresenter.Structured(CanopyGridStructuredDisplay.Count, countText: "{count} names") });
        view.Record.Fields.Add(new CanopyColumn("history", "History"));
        var row = new CanopyGridRow("c1");
        row.Cells["cn"] = CanopyCell.Link("app.example.com", "c2");
        row.Cells["names"] = CanopyCell.List(new CanopyCell[] { 1.5, new DateTime(2026, 1, 2, 0, 0, 0, DateTimeKind.Utc), "é" });
        row.Fields["history"] = CanopyCell.Timeline(new[] { new CanopyRecordEvent(new DateTime(2026, 3, 4, 5, 6, 7, 89, DateTimeKind.Utc), "Issued") });
        view.Rows.Add(row);
        var json = view.ToJson();
        Assert.Contains("\"names\":{\"value\":\"1.5, 2026-01-02T00:00:00Z, é\"", json);
        Assert.Contains("\"events\":[{\"time\":\"2026-03-04T05:06:07.089Z\",\"summary\":\"Issued\"}]", json);
        Assert.Contains("\"ref\":{\"id\":\"c2\"}", json);
        Assert.Contains("\"record\":{\"fields\":[{\"id\":\"history\",\"title\":\"History\"}],\"deepLink\":true,\"source\":{\"kind\":\"sidecar\",\"base\":\"records/\",\"shards\":8}}", json);
        Assert.Equal(9, CanopyRecordSidecar.Shard("c1", 16));
        Assert.Equal(0, CanopyRecordSidecar.Shard("é😀", 7));
        var answer = new CanopyGridRecord("c1") { Revision = "r1" };
        answer.Fields["history"] = CanopyCell.Diff(new[] { new CanopyFieldChange("Owner", "A", "B") });
        Assert.Equal("{\"protocol\":\"canopyx/2\",\"type\":\"gridRecord\",\"view\":\"certs\",\"id\":\"c1\",\"revision\":\"r1\",\"fields\":{\"history\":{\"changes\":[{\"name\":\"Owner\",\"before\":\"A\",\"after\":\"B\"}]}}}", answer.ToJson(view));
        var folder = Path.Combine(Path.GetTempPath(), "canopyx-records-fx-" + Guid.NewGuid().ToString("N"));
        try {
            var files = CanopyRecordSidecar.Write(folder, view, new[] { answer });
            var text = File.ReadAllText(Path.Combine(folder, files[0]), Encoding.UTF8);
            Assert.Equal("(self.CanopyXSidecar = self.CanopyXSidecar || []).push([\"certs\",\"r1\",{\"protocol\":\"canopyx/2\",\"type\":\"gridRecordPack\",\"view\":\"certs\",\"shard\":1,\"records\":[{\"id\":\"c1\",\"fields\":{\"history\":{\"changes\":[{\"name\":\"Owner\",\"before\":\"A\",\"after\":\"B\"}]}}}]}]);\n", text);
        } finally {
            if (Directory.Exists(folder)) Directory.Delete(folder, true);
        }
    }
}
