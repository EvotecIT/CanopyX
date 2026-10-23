using System.Text.Json.Nodes;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Records;

/// <summary>The record panel's wire contract: the view's record panel, record fields, structured cells and drawer switches.</summary>
public sealed class RecordPanelContractTests {
    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(12)]
    public void RecordOnlyWrappedFieldsRetainTheirDeclaredLineLimit(int maxLines) {
        var view = Grid();
        view.Record!.Fields.Add(new CanopyColumn("observation", "Observation") { Wrap = true, MaxLines = maxLines });
        var json = view.ToJson();
        var fields = JsonNode.Parse(json)!["record"]!["fields"]!.AsArray();
        var field = fields.Single(item => item!["id"]!.GetValue<string>() == "observation")!;
        Assert.Equal(maxLines, field["maxLines"]?.GetValue<int>() ?? 2);
        ProtocolSchema.AssertValid(json, "record-only wrapped field with an authored line limit");
    }

    internal static CanopyDataGridView Grid() {
        var view = new CanopyDataGridView("certs", "Certificates");
        view.Columns.Add(new CanopyColumn("cn", "Common name") { Sortable = true });
        view.Columns.Add(new CanopyColumn("status", "Status") { Presenter = CanopyGridPresenter.State() });
        view.Columns.Add(new CanopyColumn("names", "Names") { Presenter = CanopyGridPresenter.Structured(CanopyGridStructuredDisplay.Chips, 2, "{count} names") });
        view.Columns.Add(new CanopyColumn("serial", "Serial") { Hidden = true, ShowInDrawer = false });
        var record = view.Record = new CanopyRecordPanel { DeepLink = true, DeepLinkKey = "cert", HeaderStatus = "status", JumpList = true, Actions = CanopyRecordActions.Copy | CanopyRecordActions.Print };
        record.HeaderFacts.Add("cn");
        record.Fields.Add(new CanopyColumn("thumbprint", "Thumbprint"));
        record.Fields.Add(new CanopyColumn("issued", "Issued") { Kind = CanopyColumnKind.DateTime });
        record.Fields.Add(new CanopyColumn("trend", "Trend") { Kind = CanopyColumnKind.Number, Presenter = CanopyGridPresenter.SparklineLine() });
        record.Fields.Add(new CanopyColumn("contacts", "Contacts") { Section = "People" });
        var identity = new CanopyRecordSection("identity", "Identity") { Renderer = "key-chart" };
        identity.Fields.Add("thumbprint"); identity.Fields.Add("names");
        identity.Sections.Add(new CanopyRecordSection("dates", "Dates") { Collapsed = true });
        identity.Sections[0].Fields.Add("issued");
        record.Sections.Add(identity);
        var tab = new CanopyRecordTab("overview", "Overview");
        tab.Sections.Add("identity");
        record.Tabs.Add(tab);
        return view;
    }

    internal static CanopyGridRow Row(string id) {
        var row = new CanopyGridRow(id);
        row.Cells["cn"] = "app.example.com";
        row.Cells["status"] = new CanopyCell("Valid") { Tone = CanopyTone.Success };
        row.Cells["names"] = CanopyCell.List("app.example.com", "www.app.example.com");
        row.Fields["thumbprint"] = new CanopyCell("AB12") { Ref = new CanopyRecordRef("c2") };
        row.Fields["issued"] = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        var contacts = new CanopyRecordList { Total = 4, PageLength = 5, PageSize = 2, Target = new CanopyRecordTarget("people") { Column = "name" } };
        contacts.Target.Values.Add("Alex");
        contacts.Columns.Add(new CanopyColumn("role", "Role"));
        contacts.Columns.Add(new CanopyColumn("name", "Name"));
        var contact = new CanopyGridRow("owner");
        contact.Cells["role"] = "Owner"; contact.Cells["name"] = CanopyCell.Link("Alex", "p1", "people");
        contacts.Rows.Add(contact);
        row.Fields["contacts"] = CanopyCell.Collection(contacts);
        return row;
    }

    [Fact]
    public void Grid_WritesTheRecordPanelRecordFieldsAndStructuredCells() {
        var view = Grid();
        view.Rows.Add(Row("c1"));
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "a grid with a record panel");
        var doc = JsonNode.Parse(json)!;
        var record = doc["record"]!;
        Assert.Equal("cert", record["deepLink"]!["key"]!.GetValue<string>());
        Assert.Equal("status", record["header"]!["status"]!.GetValue<string>());
        Assert.False(record["actions"]!["export"]!.GetValue<bool>());
        Assert.Null(record["actions"]!["copy"]);
        Assert.Equal("key-chart", record["sections"]![0]!["renderer"]!.GetValue<string>());
        Assert.True(record["sections"]![0]!["sections"]![0]!["collapsed"]!.GetValue<bool>());
        Assert.Equal("datetime", record["fields"]![1]!["kind"]!.GetValue<string>());
        Assert.Equal("sparklineLine", record["fields"]![2]!["presenter"]!["kind"]!.GetValue<string>());
        Assert.False(doc["columns"]![3]!["drawer"]!.GetValue<bool>());
        Assert.Equal("{\"kind\":\"structured\",\"display\":\"chips\",\"limit\":2,\"countText\":\"{count} names\"}", doc["columns"]![2]!["presenter"]!.ToJsonString());
        var row = doc["rows"]![0]!;
        Assert.Equal("app.example.com, www.app.example.com", row["cells"]!["names"]!["value"]!.GetValue<string>());
        Assert.Equal(2, row["cells"]!["names"]!["items"]!.AsArray().Count);
        Assert.Equal("c2", row["fields"]!["thumbprint"]!["ref"]!["id"]!.GetValue<string>());
        Assert.Equal("2026-01-02T03:04:05Z", row["fields"]!["issued"]!.GetValue<string>());
        var contacts = row["fields"]!["contacts"]!["records"]!;
        Assert.Equal(4, contacts["total"]!.GetValue<int>());
        Assert.Equal("people", contacts["target"]!["view"]!.GetValue<string>());
        Assert.Equal("p1", contacts["rows"]![0]!["cells"]!["name"]!["ref"]!["id"]!.GetValue<string>());
    }

    [Fact]
    public void StructuredCells_WriteObjectsTimelinesAndChanges_AndMatchTheSchema() {
        var view = new CanopyDataGridView("records", "Records") { Record = new CanopyRecordPanel() };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        foreach (var id in new[] { "policy", "history", "changes" }) view.Record.Fields.Add(new CanopyColumn(id, id));
        var row = new CanopyGridRow("r1");
        row.Cells["name"] = "One";
        row.Fields["policy"] = CanopyCell.Object(new CanopyCellField("Profile", "Web"), new CanopyCellField("Size", 2048) { Kind = CanopyColumnKind.Number },
            new CanopyCellField("Names", CanopyCell.List("a", "b")));
        var issued = new CanopyRecordEvent(new DateTime(2026, 5, 6, 7, 8, 9, 10, DateTimeKind.Utc), "Issued") { Actor = "CA", Kind = "Issue", Tone = CanopyTone.Success, Ref = new CanopyRecordRef("r2") };
        issued.Changes.Add(new CanopyFieldChange("Owner", "A", "B"));
        row.Fields["history"] = CanopyCell.Timeline(new[] { issued, new CanopyRecordEvent(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), "Requested") });
        row.Fields["changes"] = CanopyCell.Diff(new[] { new CanopyFieldChange("Recipients", CanopyCell.List("a"), CanopyCell.List("a", "b")), new CanopyFieldChange("Size", null, 4096) { Kind = CanopyColumnKind.Number } });
        view.Rows.Add(row);
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "structured record fields");
        var fields = JsonNode.Parse(json)!["rows"]![0]!["fields"]!;
        Assert.Equal("number", fields["policy"]!["fields"]![1]!["kind"]!.GetValue<string>());
        Assert.Equal("2026-05-06T07:08:09.010Z", fields["history"]!["events"]![0]!["time"]!.GetValue<string>());
        Assert.Equal("success", fields["history"]!["events"]![0]!["tone"]!.GetValue<string>());
        Assert.Equal("Owner", fields["history"]!["events"]![0]!["changes"]![0]!["name"]!.GetValue<string>());
        Assert.Null(fields["changes"]!["changes"]![1]!["before"]);
    }

    // Writes a cell as a record field value: the view's writer checks it.
    private static void Write(CanopyCell cell) {
        var view = new CanopyDataGridView("v", "V") { Record = new CanopyRecordPanel() };
        view.Columns.Add(new CanopyColumn("a", "A"));
        view.Record.Fields.Add(new CanopyColumn("value", "Value"));
        var row = new CanopyGridRow("r"); row.Fields["value"] = cell; view.Rows.Add(row);
        view.ToJson();
    }

    [Fact]
    public void StructuredCells_RejectInvalidStructures() {
        var both = new CanopyCell("x"); both.Items.Add("a"); both.Fields.Add(new CanopyCellField("b", "c"));
        Assert.Throws<InvalidOperationException>(() => Write(both));
        var nested = new CanopyCell(); nested.Items.Add(CanopyCell.List("a"));
        Assert.Throws<InvalidOperationException>(() => Write(nested));
        var deep = CanopyCell.Object(new CanopyCellField("x", "y"));
        for (var depth = 0; depth < CanopyCell.MaxStructureDepth + 1; depth++) deep = CanopyCell.Object(new CanopyCellField("x", deep));
        Assert.Throws<InvalidOperationException>(() => Write(deep));
        var list = new CanopyRecordList();
        Assert.Throws<InvalidOperationException>(() => Write(CanopyCell.Collection(list)));
        list.Columns.Add(new CanopyColumn("a", "A"));
        list.Rows.Add(new CanopyGridRow("x")); list.Rows.Add(new CanopyGridRow("x"));
        Assert.Throws<InvalidOperationException>(() => Write(CanopyCell.Collection(list)));
        Assert.Throws<ArgumentException>(() => new CanopyCellField(" ", "x"));
        Assert.Throws<ArgumentException>(() => new CanopyRecordEvent(DateTime.UtcNow, ""));
        var link = CanopyCell.Link("B", "b"); link.Ref!.Path.Add("a");
        Assert.Throws<InvalidOperationException>(() => Write(link));
        Write(CanopyCell.List(Enumerable.Range(0, 4096).Select(index => new CanopyCell(index))));
        // Collections count toward the depth: an object in a collection row in an object, and so on.
        CanopyCell nest = "leaf";
        for (var level = 0; level < 5; level++) {
            var inner = new CanopyRecordList(); inner.Columns.Add(new CanopyColumn("v", "V"));
            var row = new CanopyGridRow("r"); row.Cells["v"] = CanopyCell.Object(new CanopyCellField("x", nest)); inner.Rows.Add(row);
            nest = CanopyCell.Collection(inner);
        }
        Assert.Throws<InvalidOperationException>(() => Write(nest));
        Assert.Throws<InvalidOperationException>(() => Write(CanopyCell.List(Enumerable.Range(0, 4097).Select(index => new CanopyCell(index)))));
    }
    [Fact]
    public void RecordPanel_RejectsUndeclaredReferencesAndClashes() {
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); view.Record!.Fields.Add(new CanopyColumn("cn", "Again")); view.Validate(); });
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); view.Record!.Sections[0].Fields.Add("nope"); view.Validate(); });
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); view.Record!.Tabs[0].Sections.Add("dates"); view.Validate(); });
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); view.Record!.Sections.Add(new CanopyRecordSection("identity", "Twice")); view.Validate(); });
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); foreach (var id in new[] { "cn", "status", "names", "thumbprint", "issued", "trend" }) view.Record!.HeaderFacts.Add(id); view.Validate(); });
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); view.Record!.HeaderStatus = "nope"; view.Validate(); });
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); var row = Row("c1"); row.Fields["nope"] = "x"; view.Rows.Add(row); view.Validate(); });
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); view.Record = null; view.Rows.Add(Row("c1")); view.Validate(); });
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); view.Record!.Fields[2] = new CanopyColumn("trend", "Trend") { Presenter = CanopyGridPresenter.Progress() }; view.Validate(); });
        Assert.Throws<ArgumentException>(() => new CanopyRecordPanel { DeepLinkKey = "1bad" });
        Assert.Throws<ArgumentException>(() => new CanopyRecordSection("s", "S") { Renderer = "Bad Name" });
        Assert.Throws<ArgumentException>(() => CanopyRecordSource.Sidecar("../records/", 4));
        Assert.Throws<ArgumentException>(() => CanopyRecordSource.Sidecar("records", 4));
        Assert.Throws<ArgumentException>(() => CanopyRecordSource.Sidecar("/records/", 4));
        Assert.Throws<ArgumentException>(() => CanopyRecordSource.Sidecar("data\\records/", 4));
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); view.Record!.Fields.Add(new CanopyColumn("__proto__", "Prototype")); view.Validate(); });
        Assert.Throws<InvalidOperationException>(() => { var view = Grid(); var deep = new CanopyRecordSection("deep", "Deep"); view.Record!.Sections[0].Sections[0].Sections.Add(deep); deep.Sections.Add(new CanopyRecordSection("deeper", "Deeper")); view.Validate(); });
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyRecordSource.Sidecar("records/", 0));
        Assert.Throws<ArgumentException>(() => CanopyGridPresenter.Structured(countText: "names"));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyGridPresenter.Structured(limit: 17));
    }

    [Fact]
    public void RecordPanel_DefaultsWriteAnEmptyObject_AndSourcesWriteTheirKind() {
        var view = new CanopyDataGridView("plain", "Plain") { Record = new CanopyRecordPanel() };
        view.Columns.Add(new CanopyColumn("a", "A"));
        Assert.Equal("{}", JsonNode.Parse(view.ToJson())!["record"]!.ToJsonString());
        view.Record.Source = CanopyRecordSource.Sidecar("records/", 64);
        view.Record.HideEmpty = false;
        view.Record.DeepLink = true;
        Assert.Equal("{\"hideEmpty\":false,\"deepLink\":true,\"source\":{\"kind\":\"sidecar\",\"base\":\"records/\",\"shards\":64}}", JsonNode.Parse(view.ToJson())!["record"]!.ToJsonString());
        view.Record.Source = CanopyRecordSource.Host();
        Assert.Equal("{\"kind\":\"host\"}", JsonNode.Parse(view.ToJson())!["record"]!["source"]!.ToJsonString());
        ProtocolSchema.AssertValid(view.ToJson(), "a grid with a host record source");
    }

    [Fact]
    public void Tree_WritesItsRecordPanelNodeFieldsSectionsAndDrawerSwitches() {
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        tree.Columns.Add(new CanopyColumn("state", "State") { Section = "Health" });
        tree.Columns.Add(new CanopyColumn("key", "Key") { ShowInDrawer = false });
        tree.Record = new CanopyRecordPanel { DeepLink = true };
        tree.Record.Fields.Add(new CanopyColumn("owner", "Owner") { Presenter = CanopyGridPresenter.State() });
        var node = new CanopyNode("a", "Alpha");
        node.Fields["owner"] = CanopyCell.Link("Team", "b");
        node.Fields["owner"].Ref!.Path.Add("b");
        tree.Roots.Add(node);
        tree.Roots.Add(new CanopyNode("b", "Beta"));
        var json = tree.ToJson();
        ProtocolSchema.AssertValid(json, "a tree with a record panel");
        var doc = JsonNode.Parse(json)!;
        Assert.Equal("Health", doc["columns"]![1]!["section"]!.GetValue<string>());
        Assert.False(doc["columns"]![2]!["drawer"]!.GetValue<bool>());
        // Presenters of record fields apply on flat grids only.
        Assert.Null(doc["record"]!["fields"]![0]!["presenter"]);
        Assert.Equal("b", doc["roots"]![0]!["fields"]!["owner"]!["ref"]!["path"]![0]!.GetValue<string>());
        node.Fields["unknown"] = "x";
        Assert.Throws<InvalidOperationException>(() => tree.ToJson());
        tree.Record = null; node.Fields.Remove("unknown");
        Assert.Throws<InvalidOperationException>(() => tree.ToJson());
    }

    [Fact]
    public void TreeCollections_WriteInlineRoots_AndRejectLazyChildren() {
        var view = new CanopyDataGridView("g", "G") { Record = new CanopyRecordPanel() };
        view.Columns.Add(new CanopyColumn("a", "A"));
        view.Record.Fields.Add(new CanopyColumn("chain", "Chain"));
        var list = new CanopyRecordList();
        list.Columns.Add(new CanopyColumn("name", "Name"));
        var root = new CanopyNode("r", "Root");
        root.Children.Add(new CanopyNode("c", "Child"));
        list.Roots.Add(root);
        var row = new CanopyGridRow("x"); row.Cells["a"] = "A"; row.Fields["chain"] = CanopyCell.Collection(list);
        view.Rows.Add(row);
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "a tree collection");
        Assert.Equal("c", JsonNode.Parse(json)!["rows"]![0]!["fields"]!["chain"]!["records"]!["roots"]![0]!["children"]![0]!["id"]!.GetValue<string>());
        root.Children.Clear(); root.HasChildren = true;
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
    }
}
