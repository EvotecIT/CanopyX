using System.Text.Json.Nodes;
using CanopyX.Bundles;

namespace CanopyX.Tests.Bundles;

/// <summary>
/// Opening a node reads the whole pack its children page is in, so the children pack size decides how much an expand
/// loads. It must only regroup pages into files: the pages themselves, and so what the runtime shows, stay the same.
/// The pages of one list stay together, because the runtime reads them one after another.
/// </summary>
public sealed class ChildPackTests {
    [Fact]
    public void ChildPackBytes_Smaller_RegroupsTheSamePagesIntoMoreFilesOfThatSize() {
        var view = TestTrees.FileShares(shares: 4, foldersPerShare: 20, filesPerFolder: 20, bigFolder: 1500);
        var small = Write(view, new CanopyBundleOptions { ChildPackBytes = 16 * 1024 });
        var large = Write(view, new CanopyBundleOptions { ChildPackBytes = 512 * 1024 });
        try {
            var smallFiles = new SidecarFiles(small.Result.DataDirectory, view.Id);
            var largeFiles = new SidecarFiles(large.Result.DataDirectory, view.Id);

            Assert.Equal(TestTrees.Ids(view.Roots), smallFiles.WalkIds());
            Assert.Equal(Pages(largeFiles), Pages(smallFiles));
            Assert.Equal(large.Result.PageCount, small.Result.PageCount);
            Assert.True(small.Result.PackCount > 4 * large.Result.PackCount, small.Result.PackCount + " packs at 16 KiB, " + large.Result.PackCount + " at 512 KiB.");

            // The lists of different nodes share a pack only while they fit the size; a longer list has a pack of its own.
            var packs = smallFiles.Sizes.Keys.Where(reference => reference.StartsWith("p/", StringComparison.Ordinal)).ToList();
            Assert.Equal(small.Result.PackCount, packs.Count);
            Assert.All(packs, pack => Assert.True(smallFiles.Sizes[pack] <= 16 * 1024 || Parents(smallFiles, pack).Count == 1,
                pack + " holds the pages of " + Parents(smallFiles, pack).Count + " lists in " + smallFiles.Sizes[pack] + " bytes."));
            // The six pages of the 1,500 files of the big folder stay in one pack, so paging to its end reads one file.
            var bigFolder = packs.Where(pack => Parents(smallFiles, pack).Contains("s0/f0")).ToList();
            Assert.Equal(6, PageCount(smallFiles, Assert.Single(bigFolder)));
            Assert.True(smallFiles.Sizes[bigFolder[0]] > 16 * 1024);
        } finally {
            Directory.Delete(small.Directory, recursive: true);
            Directory.Delete(large.Directory, recursive: true);
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(16 * 1024 - 1)]
    [InlineData(16 * 1024 * 1024 + 1)]
    public void ChildPackBytes_OutsideTheRange_Throws(int bytes) {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyBundleOptions { ChildPackBytes = bytes });
        Assert.Equal(128 * 1024, new CanopyBundleOptions().ChildPackBytes);
    }

    /// <summary>Every children page by its list and position, without the references that name its file.</summary>
    private static List<string> Pages(SidecarFiles files) => files.Pages()
        .Select(page => JsonNode.Parse(page.Value)!)
        .Select(page => page["parent"] + "@" + page["offset"] + "/" + page["total"] + ":" + string.Join("|", page["items"]!.AsArray().Select(item => item!["id"]!.GetValue<string>())))
        .OrderBy(page => page, StringComparer.Ordinal)
        .ToList();

    private static int PageCount(SidecarFiles files, string pack) => JsonNode.Parse(files.Documents[pack])!["pages"]!.AsArray().Count;

    /// <summary>The nodes whose children pages a pack holds.</summary>
    private static HashSet<string> Parents(SidecarFiles files, string pack) => JsonNode.Parse(files.Documents[pack])!["pages"]!.AsArray()
        .Select(page => JsonNode.Parse(page!.GetValue<string>())!["parent"]!.GetValue<string>())
        .ToHashSet(StringComparer.Ordinal);

    private static (string Directory, CanopyBundleResult Result) Write(CanopyView view, CanopyBundleOptions options) {
        var directory = Path.Combine(Path.GetTempPath(), "canopyx-cpack-" + Guid.NewGuid().ToString("N"));
        return (directory, new CanopyBundleWriter(options).Write(view, directory));
    }
}
