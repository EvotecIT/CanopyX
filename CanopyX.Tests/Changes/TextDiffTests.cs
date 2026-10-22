using System.Text.Json;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests.Changes;

/// <summary>The text diff: the comparison shared with the browser, hunks from numbered lines, the unified diff, the document and its checks.</summary>
public sealed class TextDiffTests {
    private static JsonDocument Fixture() => JsonDocument.Parse(File.ReadAllText(Path.Combine(RepositoryPaths.Root, "tests", "fixtures", "diff-cases.json")));

    private static string Wire(CanopyDiffLine line) => (line.Kind == CanopyDiffLineKind.Added ? "+" : line.Kind == CanopyDiffLineKind.Removed ? "-" : " ") + line.Text;

    [Fact]
    public void Compare_ProducesTheSharedFixtureHunks() {
        using var fixture = Fixture();
        foreach (var entry in fixture.RootElement.GetProperty("lines").EnumerateArray()) {
            var diff = new CanopyTextDiff("t", "T") { BeforeText = entry.GetProperty("before").GetString(), AfterText = entry.GetProperty("after").GetString(), Context = entry.GetProperty("context").GetInt32() }.Compare();
            var expected = entry.GetProperty("hunks").EnumerateArray().Select(hunk => hunk.GetProperty("before").GetInt32() + "," + hunk.GetProperty("after").GetInt32() + ":" +
                string.Join("|", hunk.GetProperty("lines").EnumerateArray().Select(line => line.GetString()))).ToList();
            var actual = diff.Hunks.Select(hunk => hunk.BeforeStart + "," + hunk.AfterStart + ":" + string.Join("|", hunk.Lines.Select(Wire))).ToList();
            Assert.True(expected.SequenceEqual(actual), entry.GetProperty("name").GetString() + ": " + string.Join(" / ", actual));
            diff.Validate();
        }
    }

    [Fact]
    public void Words_MarkTheSharedFixtureRanges() {
        using var fixture = Fixture();
        foreach (var entry in fixture.RootElement.GetProperty("words").EnumerateArray()) {
            // The comparison is internal: the static diff marks words with it, so it is reached here as the renderer reaches it.
            var words = ((List<(int, int)> Before, List<(int, int)> After)?)typeof(CanopyTextDiff).Assembly.GetType("CanopyX.CanopyTextDiffAlgorithm")!
                .GetMethod("Words", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!.Invoke(null, new object[] { entry.GetProperty("before").GetString()!, entry.GetProperty("after").GetString()! });
            var marks = entry.GetProperty("marks");
            if (marks.ValueKind == JsonValueKind.Null) { Assert.Null(words); continue; }
            static string Ranges(IEnumerable<(int Start, int End)> ranges) => string.Join(";", ranges.Select(range => range.Start + "-" + range.End));
            static string Json(JsonElement ranges) => string.Join(";", ranges.EnumerateArray().Select(range => range[0].GetInt32() + "-" + range[1].GetInt32()));
            Assert.NotNull(words);
            Assert.Equal(Json(marks.GetProperty("before")), Ranges(words!.Value.Before));
            Assert.Equal(Json(marks.GetProperty("after")), Ranges(words.Value.After));
        }
    }

    [Fact]
    public void Compare_BoundsUnrelatedTextsAsOneReplacement() {
        var before = string.Join("\n", Enumerable.Range(0, 3000).Select(i => "left " + i));
        var after = string.Join("\n", Enumerable.Range(0, 3000).Select(i => "right " + i));
        var diff = CanopyTextDiff.FromTexts("big", "Big", before, after, compare: true);
        var hunk = Assert.Single(diff.Hunks);
        Assert.Equal(3000, hunk.Lines.Count(line => line.Kind == CanopyDiffLineKind.Removed));
        Assert.Equal(3000, hunk.Lines.Count(line => line.Kind == CanopyDiffLineKind.Added));
        Assert.True(hunk.Lines.TakeWhile(line => line.Kind == CanopyDiffLineKind.Removed).Count() == 3000, "Removed lines come first.");
    }

    [Fact]
    public void AddLines_SplitsHunksAtGapsAndInfersTheStartsOfInsertions() {
        var diff = new CanopyTextDiff("d", "D").AddLines(new[] {
            new CanopyDiffLine(CanopyDiffLineKind.Context, "a", 4, 4),
            new CanopyDiffLine(CanopyDiffLineKind.Removed, "b", 5),
            new CanopyDiffLine(CanopyDiffLineKind.Added, "B", afterNumber: 5),
            new CanopyDiffLine(CanopyDiffLineKind.Context, "c", 6, 6),
            new CanopyDiffLine(CanopyDiffLineKind.Added, "new", afterNumber: 20)
        });
        Assert.Equal(2, diff.Hunks.Count);
        Assert.Equal((4, 4, 3, 3), (diff.Hunks[0].BeforeStart, diff.Hunks[0].AfterStart, diff.Hunks[0].BeforeCount, diff.Hunks[0].AfterCount));
        // The second hunk inserts after line 19 on both sides: the unchanged run between hunks is as long on both sides.
        Assert.Equal((20, 20), (diff.Hunks[1].BeforeStart, diff.Hunks[1].AfterStart));
        diff.Validate();
        Assert.Throws<ArgumentException>(() => new CanopyTextDiff("x", "X").AddLines(new[] { new CanopyDiffLine(CanopyDiffLineKind.Context, "a") }));
        Assert.Throws<ArgumentException>(() => new CanopyTextDiff("x", "X").AddLines(new[] {
            new CanopyDiffLine(CanopyDiffLineKind.Context, "a", 9, 9), new CanopyDiffLine(CanopyDiffLineKind.Context, "b", 3, 3) }));
    }

    [Fact]
    public void ToUnifiedDiff_WritesGnuHeadersAndRanges() {
        var diff = CanopyTextDiff.FromTexts("u", "settings.ini", "a\nb\nc\n", "a\nB\nc\nd\n", compare: true);
        diff.Path = "Config/settings.ini";
        diff.PreviousPath = "Config/old.ini";
        Assert.Equal("--- a/Config/old.ini\n+++ b/Config/settings.ini\n@@ -1,3 +1,4 @@\n a\n-b\n+B\n c\n+d\n", diff.ToUnifiedDiff());
        var added = CanopyTextDiff.FromTexts("e", "new.txt", string.Empty, "x\n", compare: true);
        Assert.Equal("--- a/new.txt\n+++ b/new.txt\n@@ -0,0 +1 @@\n+x\n", added.ToUnifiedDiff());
        added.UnifiedDiff = "host";
        Assert.Equal("host", added.ToUnifiedDiff());
    }

    [Fact]
    public void Json_RoundTripsAndMatchesTheSchema() {
        var diff = CanopyTextDiff.FromTexts("logon", "map-drives.ps1", "a\nb\n", "a\nc\n", compare: true);
        diff.Path = "Scripts/map-drives.ps1";
        diff.BeforeTitle = "FS01";
        diff.Layout = CanopyDiffLayout.Inline;
        diff.Notes.Add(new CanopyChangeNote("Line endings changed.", CanopyTone.Warning));
        diff.Labels = CanopyLabels.Polish();
        var json = diff.ToJson();
        ProtocolSchema.AssertValid(json, "Diff writer");
        Assert.Contains("\"hunks\":[{\"before\":1,\"after\":1,\"lines\":[\" a\",\"-b\",\"+c\"]}]", json);
        Assert.Contains("\"changeInline\":\"W jednej kolumnie\"", json);
        var read = CanopyTextDiff.FromJson(json);
        Assert.Equal(json, read.ToJson());
        Assert.Equal(2, read.Hunks[0].Lines[2].AfterNumber);
        var binary = new CanopyTextDiff("bin", "agent.exe") { Content = CanopyDiffContent.Binary };
        ProtocolSchema.AssertValid(binary.ToJson(), "Binary diff");
        Assert.Contains("\"content\":\"binary\"", binary.ToJson());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    [InlineData(4)]
    public void Validate_RejectsOmittedReplacementsInUnchangedRegions(int omitted) {
        var before = new[] { "a", "b", "c", "d", "e" };
        var after = new[] { "a", "B", "c", "D", "e" };
        after[omitted] = "omitted";
        var diff = CanopyTextDiff.FromTexts("d", "D", string.Join("\n", before), string.Join("\n", after));
        diff.Hunks.Add(new CanopyDiffHunk(2, 2).Line(CanopyDiffLineKind.Removed, "b").Line(CanopyDiffLineKind.Added, "B"));
        diff.Hunks.Add(new CanopyDiffHunk(4, 4).Line(CanopyDiffLineKind.Removed, "d").Line(CanopyDiffLineKind.Added, "D"));
        Assert.Throws<InvalidOperationException>(() => diff.Validate());
        Assert.Throws<InvalidOperationException>(() => diff.ToJson());
    }

    [Theory]
    [InlineData("a\n", "b", "-a\n+b\n\\ No newline at end of file\n")]
    [InlineData("a", "b\n", "-a\n\\ No newline at end of file\n+b\n")]
    [InlineData("a", "b", "-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n")]
    [InlineData("a\n", "a", "-a\n+a\n\\ No newline at end of file\n")]
    [InlineData("a", "a\n", "-a\n\\ No newline at end of file\n+a\n")]
    public void ToUnifiedDiff_PreservesFinalNewlineState(string before, string after, string lines) {
        var diff = CanopyTextDiff.FromTexts("d", "file.txt", before, after, compare: true);
        Assert.Equal("--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n" + lines, diff.ToUnifiedDiff());
    }

    [Theory]
    [InlineData("a", "a\nb\n", "--- a/file.txt\n+++ b/file.txt\n@@ -1 +1,2 @@\n-a\n\\ No newline at end of file\n+a\n+b\n")]
    [InlineData("a\nb", "A\nb", "--- a/file.txt\n+++ b/file.txt\n@@ -1,2 +1,2 @@\n-a\n+A\n b\n\\ No newline at end of file\n")]
    [InlineData("", "b", "--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1 @@\n+b\n\\ No newline at end of file\n")]
    [InlineData("a", "", "--- a/file.txt\n+++ b/file.txt\n@@ -1 +0,0 @@\n-a\n\\ No newline at end of file\n")]
    [InlineData("a\r\n", "b\r\n", "--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-a\n+b\n")]
    public void ToUnifiedDiff_PreservesEofAcrossContextInsertionsAndEmptySides(string before, string after, string expected) {
        Assert.Equal(expected, CanopyTextDiff.FromTexts("d", "file.txt", before, after, compare: true).ToUnifiedDiff());
    }

    [Theory]
    [InlineData("no lines")]
    [InlineData("one text")]
    [InlineData("hunks out of order")]
    [InlineData("uneven gap")]
    [InlineData("line break in a line")]
    [InlineData("line that does not match its text")]
    [InlineData("hunks that miss a difference")]
    [InlineData("binary with hunks")]
    [InlineData("context out of range")]
    public void Validate_RefusesDiffsTheBrowserWouldRefuse(string defect) {
        var diff = new CanopyTextDiff("d", "D");
        switch (defect) {
            case "no lines": break;
            case "one text": diff.BeforeText = "a"; break;
            case "hunks out of order": diff.Hunks.Add(new CanopyDiffHunk(5, 5).Line(CanopyDiffLineKind.Added, "x")); diff.Hunks.Add(new CanopyDiffHunk(2, 2).Line(CanopyDiffLineKind.Added, "y")); break;
            case "uneven gap": diff.Hunks.Add(new CanopyDiffHunk(5, 7).Line(CanopyDiffLineKind.Added, "x")); break;
            case "line break in a line": diff.Hunks.Add(new CanopyDiffHunk(1, 1).Line(CanopyDiffLineKind.Added, "x\ny")); break;
            case "line that does not match its text":
                diff.BeforeText = "a\n"; diff.AfterText = "b\n"; diff.Hunks.Add(new CanopyDiffHunk(1, 1).Line(CanopyDiffLineKind.Removed, "z").Line(CanopyDiffLineKind.Added, "b")); break;
            case "hunks that miss a difference":
                diff.BeforeText = "a\nb\n"; diff.AfterText = "x\nb\nc\n"; diff.Hunks.Add(new CanopyDiffHunk(1, 1).Line(CanopyDiffLineKind.Removed, "a").Line(CanopyDiffLineKind.Added, "x")); break;
            case "binary with hunks": diff.Content = CanopyDiffContent.Binary; diff.Hunks.Add(new CanopyDiffHunk(1, 1).Line(CanopyDiffLineKind.Added, "x")); break;
            case "context out of range": diff.BeforeText = "a"; diff.AfterText = "b"; diff.Context = 21; break;
        }

        Assert.Throws<InvalidOperationException>(() => diff.Validate());
    }

    [Fact]
    public void FromJson_RefusesUnknownPropertiesAndMalformedLines() {
        var json = CanopyTextDiff.FromTexts("d", "D", "a\n", "b\n", compare: true).ToJson();
        Assert.Throws<InvalidOperationException>(() => CanopyTextDiff.FromJson(json.Replace("\"label\"", "\"extra\":1,\"label\"")));
        Assert.Throws<InvalidOperationException>(() => CanopyTextDiff.FromJson(json.Replace("\"-a\"", "\"*a\"")));
        Assert.Throws<InvalidOperationException>(() => CanopyTextDiff.FromJson(json.Replace("\"type\":\"diff\"", "\"type\":\"changes\"")));
    }
}
