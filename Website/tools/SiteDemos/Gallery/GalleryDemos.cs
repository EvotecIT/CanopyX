using System.Diagnostics;
using System.Text;
using System.Text.Json;
using SiteDemos.Docs;

namespace SiteDemos.Gallery;

/// <summary>
/// The demo galleries of the view pages: the repository's examples program writes every example page into a temporary
/// folder, the pages listed in Gallery/gallery.json (with their dark variants) are copied to static/live/gallery/, and
/// data/gallery.json describes them per view. The rest of the examples output is deleted again.
/// </summary>
internal static class GalleryDemos {
    private sealed record Entry(string Page, string Title, string Body);

    /// <summary>Writes the gallery pages and data/gallery.json; returns a one-line summary.</summary>
    internal static string Write(string website, UTF8Encoding utf8) {
        var curated = JsonSerializer.Deserialize<Dictionary<string, List<Entry>>>(
            File.ReadAllText(Path.Combine(website, "tools", "SiteDemos", "Gallery", "gallery.json")),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? throw new InvalidOperationException("Gallery/gallery.json is empty.");
        var examples = Path.Combine(Path.GetTempPath(), "canopyx-site-examples-" + Guid.NewGuid().ToString("N"));
        var gallery = Path.Combine(website, "static", "live", "gallery");
        Directory.CreateDirectory(gallery);
        try {
            RunExamples(Path.GetFullPath(Path.Combine(website, "..")), examples);
            var manifest = new Dictionary<string, List<object>>(StringComparer.Ordinal);
            var pages = 0;
            foreach (var (view, entries) in curated) {
                var list = manifest[view] = new List<object>();
                foreach (var entry in entries) {
                    var src = Copy(examples, gallery, entry.Page, entry.Title, view, utf8)
                        ?? throw new InvalidOperationException("The examples wrote no " + entry.Page + ".html for the " + view + " gallery.");
                    var srcDark = Copy(examples, gallery, entry.Page + "-dark", entry.Title, view, utf8);
                    pages += srcDark == null ? 1 : 2;
                    list.Add(srcDark == null
                        ? new { id = entry.Page, title = entry.Title, body = entry.Body, src }
                        : new { id = entry.Page, title = entry.Title, body = entry.Body, src, srcDark });
                }
            }

            File.WriteAllText(Path.Combine(website, "data", "gallery.json"),
                JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }) + "\n", utf8);
            return "Gallery: " + manifest.Values.Sum(list => list.Count) + " demos in " + pages + " pages.";
        } finally {
            if (Directory.Exists(examples)) Directory.Delete(examples, recursive: true);
        }
    }

    /// <summary>Copies one example page into the gallery, with the site's bar when it opens full screen.</summary>
    private static string? Copy(string examples, string gallery, string page, string title, string view, UTF8Encoding utf8) {
        var source = Path.Combine(examples, page + ".html");
        if (!File.Exists(source)) return null;
        var target = Path.Combine(gallery, page + ".html");
        File.Copy(source, target, overwrite: true);
        // Pages a host template wraps have no CanopyX page body; they open full screen without the bar.
        if (File.ReadAllText(target).Contains("<body class=\"cx-page\">", StringComparison.Ordinal)) {
            LiveBar.Apply(target, title, ("/views/", "Views"), "/views/" + view + "/", utf8);
        }

        return "/live/gallery/" + page + ".html";
    }

    private static void RunExamples(string repository, string output) {
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in new[] { "run", "--project", Path.Combine(repository, "CanopyX.Examples", "CanopyX.Examples.csproj"), "-c", "Release", "--", output }) {
            start.ArgumentList.Add(argument);
        }

        using var process = Process.Start(start) ?? throw new InvalidOperationException("Could not start the examples program.");
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(TimeSpan.FromMinutes(10))) {
            process.Kill(entireProcessTree: true);
            throw new InvalidOperationException("The examples program did not finish in 10 minutes.");
        }

        if (process.ExitCode != 0) throw new InvalidOperationException("The examples program failed: " + stderr.Result + stdout.Result);
    }
}
