using System.Text.Json.Nodes;
using PlaybackFixtures = CanopyX.Tests.Playback.TimeSliderFixtures;

namespace CanopyX.Tests.Protocol;

public sealed class ForestViewSchemaTests {
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Stack_OptionalContextAllowsEmptyStringsConsistentlyWithAuthoringAndRuntime(string? label) {
        var view = Grid("stack");
        view.Stack!.Layers[0].Label = label;
        ProtocolSchema.AssertValid(view.ToJson(), "stack optional context");
    }
    [Theory]
    [InlineData("path")]
    [InlineData("stack")]
    public void ForestGrid_WriterOutputMatchesSchemaWithRepeatedRecordsAndHostAnnotations(string presentation) {
        var json = Grid(presentation).ToJson();
        var root = JsonNode.Parse(json)!;
        Assert.NotNull(root[presentation]);
        var entries = presentation == "path" ? root["path"]!["chains"]![0]!["hops"]!.AsArray() : root["stack"]!["layers"]!.AsArray();
        Assert.Equal(new[] { "baseline", "session", "baseline" }, entries.Select(entry => entry!["record"]!.GetValue<string>()));
        ProtocolSchema.AssertValid(json, presentation + " writer output with repeated records, annotations and record panel");
    }

    [Theory]
    [InlineData("path")]
    [InlineData("stack")]
    public void ForestGrid_EmptyPresentationMatchesSchema(string presentation) {
        var view = Grid(presentation);
        if (presentation == "path") view.Path!.Chains.Clear(); else view.Stack!.Layers.Clear();
        var json = view.ToJson();
        Assert.Empty(JsonNode.Parse(json)![presentation]![presentation == "path" ? "chains" : "layers"]!.AsArray());
        ProtocolSchema.AssertValid(json, "empty " + presentation + " writer output");
    }

    [Theory]
    [InlineData("unknown")]
    [InlineData("duplicate")]
    [InlineData("not-array")]
    public void PathSchema_RejectsInvalidHopFlags(string defect) {
        var json = Grid("path").ToJson();
        ProtocolSchema.AssertValid(json, "path before flag mutation");
        var malformed = ProtocolSchema.Mutate(json, root => {
            var hop = root["path"]!["chains"]![0]!["hops"]![0]!;
            hop["flags"] = defect switch {
                "unknown" => JsonNode.Parse("[\"unsupported\"]"),
                "duplicate" => JsonNode.Parse("[\"cycle\",\"cycle\"]"),
                "not-array" => JsonValue.Create(true),
                _ => throw new ArgumentOutOfRangeException(nameof(defect))
            };
        });
        Assert.False(ProtocolSchema.Evaluate(malformed).IsValid, "Path accepted " + defect + " flags.");
    }

    [Theory]
    [InlineData("winner")]
    [InlineData("enforced")]
    [InlineData("filtered")]
    public void StackSchema_RejectsNonBooleanLayerFlags(string flag) {
        var json = Grid("stack").ToJson();
        ProtocolSchema.AssertValid(json, "stack before flag mutation");
        var malformed = ProtocolSchema.Mutate(json, root => root["stack"]!["layers"]![0]![flag] = "true");
        Assert.False(ProtocolSchema.Evaluate(malformed).IsValid, "Stack accepted a string " + flag + " flag.");
    }

    [Theory]
    [InlineData("path", "host")]
    [InlineData("stack", "host")]
    [InlineData("path", "ordinal")]
    [InlineData("stack", "ordinal")]
    public void ForestSchema_RequiresInlineStableRecords(string presentation, string defect) {
        var json = Grid(presentation).ToJson();
        ProtocolSchema.AssertValid(json, "forest grid before source or identity mutation");
        var malformed = ProtocolSchema.Mutate(json, root => {
            if (defect == "host") { root["source"]!["kind"] = "host"; root.Remove("rows"); }
            else root["rowIdentity"] = "ordinal";
        });
        // Without the forest presentation, the same source or identity is a valid ordinary grid.
        var control = ProtocolSchema.Mutate(malformed, root => root.Remove(presentation));
        ProtocolSchema.AssertValid(control, "ordinary grid control for " + defect);
        Assert.False(ProtocolSchema.Evaluate(malformed).IsValid, presentation + " accepted " + defect + " records.");
    }

    [Theory]
    [InlineData("board", "path")]
    [InlineData("board", "stack")]
    [InlineData("board", "calendar")]
    [InlineData("path", "stack")]
    [InlineData("path", "calendar")]
    [InlineData("stack", "calendar")]
    public void ForestSchema_RejectsSimultaneousGridPresentations(string first, string second) {
        var firstJson = Grid(first).ToJson();
        var secondJson = Grid(second).ToJson();
        ProtocolSchema.AssertValid(firstJson, first + " alone");
        ProtocolSchema.AssertValid(secondJson, second + " alone");
        var extra = JsonNode.Parse(secondJson)![second]!;
        var malformed = ProtocolSchema.Mutate(firstJson, root => root[second] = extra.DeepClone());
        Assert.False(ProtocolSchema.Evaluate(malformed).IsValid, first + " and " + second + " were accepted together.");
    }

    [Theory]
    [InlineData("filtered-winner")]
    [InlineData("no-winner")]
    [InlineData("multiple-winners")]
    public void StackSchema_RejectsContradictoryWinnerStates(string defect) {
        var json = Grid("stack").ToJson();
        ProtocolSchema.AssertValid(json, "stack before winner mutation");
        var malformed = ProtocolSchema.Mutate(json, root => {
            var layers = root["stack"]!["layers"]!;
            if (defect == "filtered-winner") layers[1]!["filtered"] = true;
            else if (defect == "no-winner") layers[1]!["winner"] = false;
            else layers[0]!["winner"] = true;
        });
        Assert.False(ProtocolSchema.Evaluate(malformed).IsValid, "Stack accepted " + defect + ".");
    }

    [Theory]
    [InlineData("matrix")]
    [InlineData("propagation")]
    public void Playback_WriterOutputMatchesSchemaWithCompleteSnapshots(string owner) {
        var json = PlaybackJson(owner);
        var root = JsonNode.Parse(json)!;
        var slider = root["timeSlider"]!;
        Assert.Equal(250, slider["interval"]!.GetValue<int>());
        Assert.Equal(0, slider["initial"]!.GetValue<int>());
        Assert.Equal(2, slider["snapshots"]!.AsArray().Count);
        foreach (var snapshot in slider["snapshots"]!.AsArray()) {
            var frame = snapshot!["view"]!;
            Assert.Equal(owner, frame["type"]!.GetValue<string>());
            Assert.Equal(root["id"]!.GetValue<string>(), frame["id"]!.GetValue<string>());
            Assert.NotNull(frame[owner == "matrix" ? "cells" : "witnesses"]);
            Assert.Null(frame["timeSlider"]);
        }
        ProtocolSchema.AssertValid(json, owner + " playback writer output");
    }

    [Theory]
    [InlineData("matrix")]
    [InlineData("propagation")]
    public void PlaybackSchema_RejectsNestedHistoryEvenWhenTheNestedViewIsValidAlone(string owner) {
        var json = PlaybackJson(owner);
        ProtocolSchema.AssertValid(json, owner + " before history nesting");
        var root = JsonNode.Parse(json)!;
        var frame = root["timeSlider"]!["snapshots"]![0]!["view"]!;
        frame["timeSlider"] = root["timeSlider"]!.DeepClone();
        ProtocolSchema.AssertValid(frame.ToJsonString(), owner + " nested view as a standalone history");
        Assert.False(ProtocolSchema.Evaluate(root.ToJsonString()).IsValid, owner + " accepted a nested history.");
    }

    private static string PlaybackJson(string owner) {
        if (owner == "matrix") {
            var view = PlaybackFixtures.MatrixSlider();
            view.TimeSlider!.IntervalMilliseconds = 250; view.TimeSlider.InitialIndex = 0;
            return view.ToJson();
        }
        var propagation = PlaybackFixtures.PropagationSlider();
        propagation.TimeSlider!.IntervalMilliseconds = 250; propagation.TimeSlider.InitialIndex = 0;
        return propagation.ToJson();
    }

    private static CanopyDataGridView Grid(string presentation) {
        var view = new CanopyDataGridView("forest-schema", "Configuration explanation") { Record = new CanopyRecordPanel() };
        view.Columns.Add(new CanopyColumn("title", "Configuration") { RowHeader = true });
        view.Columns.Add(new CanopyColumn("at", "Observed") { Kind = CanopyColumnKind.DateTime });
        foreach (var id in new[] { "baseline", "session" }) view.Rows.Add(new CanopyGridRow(id) {
            Cells = { ["title"] = id, ["at"] = PlaybackFixtures.At }
        });
        switch (presentation) {
            case "path":
                view.Path = new CanopyPath { TitleColumn = "title" };
                var chain = new CanopyPathChain("review", "Configuration review");
                chain.Hops.Add(new CanopyPathHop("baseline", "Starting context") {
                    Flags = { CanopyPathFlag.Foreign }, Badges = { new CanopyBadge("Reviewed", CanopyTone.Info) }
                });
                chain.Hops.Add(new CanopyPathHop("session"));
                chain.Hops.Add(new CanopyPathHop("baseline", "Explicit return") { Flags = { CanopyPathFlag.Cycle, CanopyPathFlag.Disabled } });
                view.Path.Chains.Add(chain);
                break;
            case "stack":
                view.Stack = new CanopyStack { TitleColumn = "title" };
                view.Stack.Layers.Add(new CanopyStackLayer("first", "baseline", "Starting context") { Label = "Shared", Enforced = true });
                view.Stack.Layers.Add(new CanopyStackLayer("effective", "session", "Selected by the host") {
                    Winner = true, Badges = { new CanopyBadge("Reviewed", CanopyTone.Success) { Title = "Host review" } }
                });
                view.Stack.Layers.Add(new CanopyStackLayer("excluded", "baseline", "Excluded by the host") { Filtered = true });
                break;
            case "board": view.Board = new CanopyBoard("title"); break;
            case "calendar": view.Calendar = new CanopyCalendar("at") { Title = "title" }; break;
            default: throw new ArgumentOutOfRangeException(nameof(presentation));
        }
        return view;
    }
}
