using HtmlTinkerX;
using Microsoft.Playwright;

// Product-specific gallery states; HtmlTinkerX owns the installed-browser session and its lifetime.
internal static class ReadmeImages {
    public static async Task RunAsync(string[] args) {
        if (args.Length < 2) throw new ArgumentException("Expected site URL, output folder, then optional view IDs.");
        var site = new Uri(args[0].TrimEnd('/') + "/");
        var output = Path.GetFullPath(args[1]);
        var selected = args.Skip(2).ToHashSet(StringComparer.Ordinal);
        Directory.CreateDirectory(output);
        var shots = new (string Id, string Path, int Height)[] {
            ("files", "live/files/index.html", 640), ("inventory", "live/inventory.html", 640),
            ("pivot", "live/pivot.html", 560), ("board", "live/board.html", 640),
            ("calendar", "live/calendar.html", 700), ("plan", "live/plan.html", 460),
            ("timeline", "live/timeline.html", 620), ("matrix", "live/matrix.html", 640),
            ("changes", "live/changes.html", 640), ("compare", "live/compare.html", 600),
            ("time", "live/time.html", 480), ("flow", "live/flow-setup-tasks.html", 700),
            ("path", "live/path.html", 560), ("stack", "live/stack.html", 640),
            ("email", "live/gallery/conditional-formatting-static.html", 600)
        };
        if (selected.Except(shots.Select(shot => shot.Id)).Any()) throw new ArgumentException("Unknown view ID.");
        foreach (var theme in new[] { "light", "dark" }) {
            await using var session = await HtmlBrowser.OpenSessionAsync("about:blank", new HtmlBrowserLaunchOptions {
                Headless = true, ManualLogin = false, Clean = false,
                BrowserChannel = Environment.GetEnvironmentVariable("CANOPYX_BROWSER_CHANNEL") ?? "msedge",
                ViewportWidth = 1280, ViewportHeight = 700, DeviceScaleFactor = 1,
                LoadState = HtmlBrowserLoadState.DomContentLoaded, Timeout = 30000
            });
            var page = session.Page;
            await page.EmulateMediaAsync(new() { ColorScheme = theme == "dark" ? ColorScheme.Dark : ColorScheme.Light });
            await page.AddInitScriptAsync("try { localStorage.setItem('cnx-theme', '" + theme + "'); } catch {}");
            foreach (var shot in shots.Where(shot => selected.Count == 0 || selected.Contains(shot.Id))) {
                await page.SetViewportSizeAsync(1280, shot.Height);
                var response = await page.GotoAsync(new Uri(site, shot.Path).AbsoluteUri, new() { WaitUntil = WaitUntilState.NetworkIdle });
                if (response is not null && !response.Ok) throw new InvalidOperationException($"HTTP {response.Status}: {shot.Path}");
                await page.AddStyleTagAsync(new() { Content = ".cnx-livebar{display:none!important}body{padding-top:0!important}" });
                await page.EvaluateAsync("value => { document.documentElement.dataset.theme = value; document.querySelectorAll('[data-cx-theme]').forEach(host => host.setAttribute('data-cx-theme', value)); }", theme);
                if (shot.Id == "files") await page.GetByRole(AriaRole.Row, new() { NameRegex = new System.Text.RegularExpressions.Regex("Finance") }).First.WaitForAsync();
                await page.EvaluateAsync("async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }");
                var file = Path.Combine(output, $"{shot.Id}-{theme}.png");
                await page.ScreenshotAsync(new() { Path = file, Animations = ScreenshotAnimations.Disabled });
                Console.WriteLine(file);
            }
        }
    }
}
