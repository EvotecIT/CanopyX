using CanopyX.Bundles;

namespace CanopyX.Tests.Bundles;

/// <summary>Writes one large bundle per test class run and removes it afterwards.</summary>
public sealed class BundleFixture : IDisposable {
    public BundleFixture() {
        View = TestTrees.FileShares(shares: 12, foldersPerShare: 30, filesPerFolder: 30, bigFolder: 3000);
        Directory = Path.Combine(Path.GetTempPath(), "canopyx-bundle-" + Guid.NewGuid().ToString("N"));
        Result = new CanopyBundleWriter(new CanopyBundleOptions { PageSize = 250, SearchShardLimit = 500 }).Write(View, Directory);
        Files = new SidecarFiles(Result.DataDirectory, View.Id);
    }

    internal CanopyTreeView View { get; }

    internal string Directory { get; }

    internal CanopyBundleResult Result { get; }

    internal SidecarFiles Files { get; }

    public void Dispose() {
        System.IO.Directory.Delete(Directory, recursive: true);
    }
}
