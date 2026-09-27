namespace CanopyX.Tests;

/// <summary>Finds the repository root from the test output folder, for tests that compare shipped files with their sources.</summary>
internal static class RepositoryPaths {
    private static readonly Lazy<string> RootPath = new(() => {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent) {
            if (File.Exists(Path.Combine(directory.FullName, "CanopyX.sln"))) {
                return directory.FullName;
            }
        }

        throw new InvalidOperationException("Could not find CanopyX.sln above " + AppContext.BaseDirectory);
    });

    internal static string Root => RootPath.Value;
}
