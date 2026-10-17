using System.Text.Json;
using System.Text.Json.Nodes;
using CanopyX.Html;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Grids;

/// <summary>Typed C# authoring of editable flat grids: editors, validation, editing settings and the commit documents.</summary>
public sealed class GridEditingContractTests {
    internal static CanopyDataGridView AssetRegister() {
        var view = new CanopyDataGridView("assets", "Asset register") { TimeZone = CanopyTimeZone.Utc };
        view.Columns.Add(new CanopyColumn("tag", "Asset tag") { Editable = true, Validation = new CanopyCellValidation { Required = true, Pattern = "[A-Z]{2}-\\d{4}", MaxLength = 7 } });
        view.Columns.Add(new CanopyColumn("cost", "Cost") { Kind = CanopyColumnKind.Number, Editable = true, Editor = CanopyCellEditor.Number(0, 100000, 0.01) });
        view.Columns.Add(new CanopyColumn("purchased", "Purchased") { Kind = CanopyColumnKind.DateTime, Editable = true, Editor = CanopyCellEditor.Date(),
            Validation = new CanopyCellValidation { Earliest = new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero) } });
        view.Columns.Add(new CanopyColumn("status", "Status") { Editable = true, Editor = CanopyCellEditor.Select("In use", "In stock", "Repair") });
        view.Columns.Add(new CanopyColumn("insured", "Insured") { Editable = true, Editor = CanopyCellEditor.Toggle() });
        var owner = CanopyCellEditor.Lookup("owner");
        owner.LookupLimit = 10;
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Editable = true, Editor = owner });
        view.Columns.Add(new CanopyColumn("rating", "Rating") { Kind = CanopyColumnKind.Number, Editable = true, Editor = CanopyCellEditor.Custom("stars") });
        view.Columns.Add(new CanopyColumn("site", "Site"));
        var row = new CanopyGridRow("a1");
        row.Cells["tag"] = "AS-1000"; row.Cells["cost"] = 900.5; row.Cells["status"] = "In use"; row.Cells["insured"] = true;
        view.Rows.Add(row);
        return view;
    }

    [Fact]
    public void EditableColumns_WriteTheirEditorsAndValidationAndMatchTheSchema() {
        var view = AssetRegister();
        view.Editing.Mode = CanopyGridEditMode.Row;
        view.Editing.Drawer = CanopyGridEditDrawer.Always;
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "editable grid");
        var columns = JsonNode.Parse(json)!["columns"]!.AsArray();
        Assert.True(columns[0]!["editable"]!.GetValue<bool>());
        Assert.Equal("""{"required":true,"maxLength":7,"pattern":"[A-Z]{2}-\\d{4}"}""", columns[0]!["validation"]!.ToJsonString());
        Assert.Equal("""{"type":"number","min":0,"max":100000,"step":0.01}""", columns[1]!["editor"]!.ToJsonString());
        Assert.Equal("""{"type":"date"}""", columns[2]!["editor"]!.ToJsonString());
        Assert.Equal("2000-01-01T00:00:00Z", columns[2]!["validation"]!["min"]!.GetValue<string>());
        Assert.Equal("""{"type":"select","options":[{"value":"In use"},{"value":"In stock"},{"value":"Repair"}]}""", columns[3]!["editor"]!.ToJsonString());
        Assert.Equal("""{"type":"lookup","lookup":{"column":"owner","limit":10}}""", columns[5]!["editor"]!.ToJsonString());
        Assert.Equal("stars", columns[6]!["editor"]!["type"]!.GetValue<string>());
        Assert.Null(columns[7]!["editable"]);
        Assert.Equal("""{"mode":"row","drawer":"always"}""", JsonNode.Parse(json)!["editing"]!.ToJsonString());
        // Editing needs no other entry point; the editing part travels with the page.
        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(view));
        Assert.Contains("application/x-canopyx-editing", view.ToHtmlFragment());
    }

    [Fact]
    public void DefaultEditingSettings_AreNotWritten() {
        var view = AssetRegister();
        Assert.Null(JsonNode.Parse(view.ToJson())!["editing"]);
        view.Editing.ReadOnly = true; view.Editing.EditBar = false;
        Assert.Equal("""{"readOnly":true,"editBar":false}""", JsonNode.Parse(view.ToJson())!["editing"]!.ToJsonString());
    }

    public static TheoryData<string, Action<CanopyDataGridView>> InvalidDefinitions() => new() {
        { "validation without editable", view => view.Columns[7].Validation = new CanopyCellValidation { Required = true } },
        { "editor without editable", view => view.Columns[7].Editor = CanopyCellEditor.Text() },
        { "number editor on text", view => view.Columns[0].Editor = CanopyCellEditor.Number() },
        { "toggle on a number column", view => view.Columns[1].Editor = CanopyCellEditor.Toggle() },
        { "date editor on a number column", view => view.Columns[1].Editor = CanopyCellEditor.DateTime() },
        { "select without options", view => view.Columns[3].Editor = CanopyCellEditor.Select(Array.Empty<string>()) },
        { "text option on a number column", view => { view.Columns[1].Editor = CanopyCellEditor.Select("one"); } },
        { "unknown lookup column", view => view.Columns[5].Editor = CanopyCellEditor.Lookup("missing") },
        { "limits on a text editor", view => view.Columns[0].Editor = new Func<CanopyCellEditor>(() => { var editor = CanopyCellEditor.Text(); editor.Minimum = 1; return editor; })() },
        { "minimum above maximum", view => view.Columns[1].Editor = CanopyCellEditor.Number(10, 1) },
        { "number range on text", view => view.Columns[0].Validation = new CanopyCellValidation { Minimum = 1 } },
        { "date range on numbers", view => view.Columns[1].Validation = new CanopyCellValidation { Earliest = DateTimeOffset.UnixEpoch } },
        { "length on numbers", view => view.Columns[1].Validation = new CanopyCellValidation { MaxLength = 3 } },
        { "invalid pattern", view => view.Columns[0].Validation = new CanopyCellValidation { Pattern = "(" } },
        { "lengths reversed", view => view.Columns[0].Validation = new CanopyCellValidation { MinLength = 5, MaxLength = 2 } },
        { "blank message", view => view.Columns[0].Validation = new CanopyCellValidation { Message = " " } },
        { "unknown edit mode", view => view.Editing.Mode = (CanopyGridEditMode)7 }
    };

    [Theory]
    [MemberData(nameof(InvalidDefinitions))]
    public void InvalidEditingDefinitions_AreRejected(string description, Action<CanopyDataGridView> change) {
        var view = AssetRegister();
        change(view);
        var error = Record.Exception(view.Validate);
        Assert.True(error is InvalidOperationException || error is ArgumentOutOfRangeException, description + ": " + error?.GetType().Name);
    }

    [Fact]
    public void EditorAndValidationValues_AreCheckedWhereTheyAreSet() {
        Assert.Throws<ArgumentException>(() => CanopyCellEditor.Custom("1bad"));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyCellEditor.Number(step: 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyEditorOption(double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyCellEditor.Lookup().LookupLimit = 51);
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyCellValidation { MinLength = -1 });
        Assert.Equal("Repair", CanopyCellEditor.Select("Repair").Options[0].ToString());
        Assert.Equal("Two", new CanopyEditorOption(2, "Two").ToString());
    }

    [Fact]
    public void TreeViews_KeepTheirProposalEditingWithoutTypedEditors() {
        var tree = new CanopyTreeView("tree", "Tree");
        tree.Columns.Add(new CanopyColumn("name", "Name") { Editable = true });
        tree.Roots.Add(new CanopyNode("a", "A"));
        Assert.Contains("\"editable\":true", tree.ToJson());
        Assert.Equal(CanopyRuntime.InteractiveTreeGrid, CanopyHtmlAssets.GetRuntime(tree));
        tree.Columns[0].Editor = CanopyCellEditor.Text();
        Assert.Throws<InvalidOperationException>(() => tree.ToJson());
    }

    public static TheoryData<string> CommitDocuments() => new() {
        """{"protocol":"canopyx/2","type":"gridCommit","view":"assets","revision":"r1","rows":[{"id":"a1","values":{"cost":12.5,"insured":false},"original":{"cost":900.5,"insured":true}}]}""",
        """{"protocol":"canopyx/2","type":"gridCommit","view":"assets","revision":null,"rows":[{"id":"a1","values":{"owner":null},"original":{"owner":"Ada"}}]}""",
        """{"protocol":"canopyx/2","type":"gridCommitResult","view":"assets","revision":"r2","rows":[{"id":"a1","status":"saved","cells":{"cost":{"value":12.5,"text":"12.50"}}},{"id":"a2","status":"error","errors":{"cost":"Over budget."}},{"id":"a3","status":"conflict","error":"Changed by someone else."}]}""",
        """{"protocol":"canopyx/2","type":"gridCommitResult","view":"assets","rows":[]}"""
    };

    [Theory]
    [MemberData(nameof(CommitDocuments))]
    public void CommitDocuments_MatchTheSchema(string json) => ProtocolSchema.AssertValid(json, "commit document");

    public static TheoryData<string> MalformedCommitDocuments() => new() {
        """{"protocol":"canopyx/2","type":"gridCommit","view":"assets","revision":"r1","rows":[]}""",
        """{"protocol":"canopyx/2","type":"gridCommit","view":"assets","revision":"r1","rows":[{"id":"a1","values":{},"original":{}}]}""",
        """{"protocol":"canopyx/2","type":"gridCommit","view":"assets","rows":[{"id":"a1","values":{"cost":1},"original":{"cost":2}}]}""",
        """{"protocol":"canopyx/2","type":"gridCommitResult","view":"assets","rows":[{"id":"a1","status":"done"}]}""",
        """{"protocol":"canopyx/2","type":"gridCommitResult","view":"assets","rows":[{"id":"a1","status":"error","cells":{"cost":1}}]}"""
    };

    [Theory]
    [MemberData(nameof(MalformedCommitDocuments))]
    public void MalformedCommitDocuments_AreRejected(string json) => Assert.False(ProtocolSchema.Evaluate(json).IsValid, json);

    [Fact]
    public void EditingLabels_AreWrittenForFlatGridsOnly() {
        var view = AssetRegister();
        view.Labels = CanopyLabels.Polish();
        var labels = JsonNode.Parse(view.ToJson())!["labels"]!;
        Assert.Equal("Zapisz", labels["gridEditSave"]!.GetValue<string>());
        Assert.Equal("{column}: pole wymagane.", labels["gridEditRequired"]!.GetValue<string>());
        var tree = new CanopyTreeView("tree", "Tree") { Labels = CanopyLabels.Polish() };
        tree.Columns.Add(new CanopyColumn("name", "Name"));
        Assert.DoesNotContain("gridEdit", tree.ToJson());
        using var document = JsonDocument.Parse(view.ToJson());
        Assert.Equal(JsonValueKind.Object, document.RootElement.GetProperty("labels").ValueKind);
    }
}
