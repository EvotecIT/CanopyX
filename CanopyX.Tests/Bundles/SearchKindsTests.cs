using CanopyX.Bundles;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Bundles;

/// <summary>
/// A view can name the node kinds its search finds. The bundle index then holds those nodes and the ancestors their
/// id paths run through, and nothing else, so rows nobody searches for cost no index space and are never a hit.
/// </summary>
public sealed class SearchKindsTests {
    [Fact]
    public void Write_SearchKinds_IndexesOnlyThoseKindsAndTheirAncestors() {
        var view = new CanopyView("kinds", "Kinds") { Search = new CanopySearchOptions { Kinds = { "record", "release" } } };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        for (var g = 0; g < 3; g++) {
            var group = new CanopyNode("g" + g, "Group " + g) { Kind = "group" };
            for (var r = 0; r < 300; r++) {
                var record = new CanopyNode(group.Id + "/r" + r, "Record " + r + " alpha") { Kind = "record" };
                var releases = new CanopyNode(record.Id + "/releases", "Releases alpha") { Kind = "section" };
                releases.Children.Add(new CanopyNode(releases.Id + "/1", "Release one alpha") { Kind = "release" });
                record.Children.Add(releases);
                var links = new CanopyNode(record.Id + "/links", "Links alpha") { Kind = "section" };
                links.Children.Add(new CanopyNode(links.Id + "/1", "Link alpha") { Kind = "link" });
                links.Children.Add(new CanopyNode(links.Id + "/2", "No kind alpha"));
                record.Children.Add(links);
                // Two levels that are not found themselves, above a node that is: both get entries when it arrives.
                var outer = new CanopyNode(record.Id + "/outer", "Outer alpha") { Kind = "section" };
                var inner = new CanopyNode(outer.Id + "/inner", "Inner alpha");
                inner.Children.Add(new CanopyNode(inner.Id + "/deep", "Deep alpha") { Kind = "record" });
                outer.Children.Add(inner);
                record.Children.Add(outer);
                group.Children.Add(record);
            }

            view.Roots.Add(group);
        }

        // A branch without any node search can find leaves no entry at all.
        var quiet = new CanopyNode("quiet", "Quiet alpha") { Kind = "group" };
        quiet.Children.Add(new CanopyNode("quiet/1", "Link alpha") { Kind = "link" });
        view.Roots.Add(quiet);
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-kinds-" + Guid.NewGuid().ToString("N"));
        try {
            var result = new CanopyBundleWriter().Write(view, directory);
            var files = new SidecarFiles(result.DataDirectory, view.Id);
            foreach (var document in files.Documents) ProtocolSchema.AssertValid(document.Value, document.Key);
            var reader = new SearchIndexReader(files);

            // Per record: the record, its releases section (an ancestor) and the release, and the two levels above
            // the deep record with that record. Plus the three groups.
            Assert.Equal(3 + 3 * 300 * 6, reader.EntryCount);
            Assert.Equal(3 * 300 * 9 + 3 + 2, result.NodeCount);
            Assert.True(reader.EntryFiles.Count > 5, "The entries should span several files, each with its own stem.");
            var alpha = reader.Find("alpha").Select(reader.Entry).ToList();
            Assert.Equal(3 * 300 * 3, alpha.Count);
            Assert.Equal(new[] { "g1", "g1/r7", "g1/r7/outer", "g1/r7/outer/inner", "g1/r7/outer/inner/deep" }, reader.Entry(Assert.Single(reader.Find("deep"), number => reader.Entry(number).Path[1] == "g1/r7")).Path);
            Assert.All(alpha, entry => Assert.Contains(entry.Kind, new[] { "record", "release" }));
            // Sections are not found, but a release's path still runs through its section.
            Assert.Empty(reader.Find("releases"));
            Assert.Empty(reader.Find("link"));
            Assert.Empty(reader.Find("quiet"));
            var release = reader.Entry(Assert.Single(reader.Find("one"), number => reader.Entry(number).Path[1] == "g2/r299"));
            Assert.Equal(new[] { "g2", "g2/r299", "g2/r299/releases", "g2/r299/releases/1" }, release.Path);
            // Every entry rebuilds its path from its own file, parents before children.
            for (var number = 0; number < reader.EntryCount; number++) {
                var path = reader.Entry(number).Path;
                Assert.StartsWith(path.Count > 1 ? path[path.Count - 2] + "/" : "g", path[path.Count - 1]);
            }
        } finally {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public void ToJson_SearchKinds_AreWrittenOnTheViewAndChecked() {
        var view = new CanopyView("v", "View") { Search = new CanopySearchOptions { Kinds = { "record" } } };
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var json = view.ToJson();

        ProtocolSchema.AssertValid(json, "view with search kinds");
        Assert.Equal("[\"record\"]", System.Text.Json.Nodes.JsonNode.Parse(json)!["search"]!["kinds"]!.ToJsonString());
        view.Search.Kinds.Add(string.Empty);
        Assert.Throws<InvalidOperationException>(() => view.ToJson());
        // A bundle is refused before its first file is written.
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-kinds-" + Guid.NewGuid().ToString("N"));
        Assert.Throws<InvalidOperationException>(() => new CanopyBundleWriter().Write(view, directory));
        Assert.False(Directory.Exists(directory));
        Assert.False(ProtocolSchema.Evaluate(ProtocolSchema.Mutate(json, doc => doc["search"]!["kinds"] = new System.Text.Json.Nodes.JsonArray())).IsValid);
    }
}
