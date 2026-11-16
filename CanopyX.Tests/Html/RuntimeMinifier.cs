using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace CanopyX.Tests.Html;

/// <summary>
/// Runs Build/minify.mjs, the esbuild pass Build/Sync-Assets.ps1 applies to every runtime script, so a test can compare
/// the shipped script with its sources. Build/Sync-Assets.ps1 restores the pinned esbuild into Build/node_modules.
/// </summary>
internal static class RuntimeMinifier {
    internal static string[] Minify(params (string Code, bool Module)[] jobs) {
        var build = Path.Combine(RepositoryPaths.Root, "Build");
        Assert.True(File.Exists(Path.Combine(build, "node_modules", "esbuild", "package.json")),
            "esbuild is not restored in Build/node_modules. Run Build/Sync-Assets.ps1 (it runs npm ci there).");
        var work = Directory.CreateTempSubdirectory("canopyx-minify-");
        try {
            var input = Path.Combine(work.FullName, "in.json"); var output = Path.Combine(work.FullName, "out.json");
            File.WriteAllText(input, JsonSerializer.Serialize(jobs.Select(job => new { code = job.Code, module = job.Module })), new UTF8Encoding(false));
            using var process = Process.Start(new ProcessStartInfo("node") { ArgumentList = { Path.Combine(build, "minify.mjs"), input, output }, RedirectStandardError = true, UseShellExecute = false })!;
            var error = process.StandardError.ReadToEnd();
            process.WaitForExit();
            Assert.True(process.ExitCode == 0, "Build/minify.mjs failed: " + error);
            return JsonSerializer.Deserialize<string[]>(File.ReadAllText(output))!;
        } finally {
            work.Delete(true);
        }
    }
}
