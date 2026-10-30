using HtmlTinkerX;
using System.Text.Json;

if (args.FirstOrDefault() == "--readme-images") {
    await ReadmeImages.RunAsync(args.Skip(1).ToArray());
    return;
}

// HtmlTinkerX owns browser installation and repair. This test-only executable selects the engines used by CI.
var engines = args.Select(name => name switch {
    "chromium" => HtmlBrowserEngine.Chromium,
    "firefox" => HtmlBrowserEngine.Firefox,
    "webkit" => HtmlBrowserEngine.WebKit,
    _ => throw new ArgumentException("Expected chromium, firefox, or webkit; received " + name + ".")
}).Distinct().ToArray();
if (engines.Length == 0) throw new ArgumentException("Select at least one browser engine.");
using var package = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "browser-package.json")));
var expected = package.RootElement.GetProperty("devDependencies").GetProperty("@playwright/test").GetString();
var installed = typeof(Microsoft.Playwright.Playwright).Assembly.GetName().Version!.ToString(3);
if (installed != expected) throw new InvalidOperationException($"HtmlTinkerX installs Playwright {installed}; browser tests require {expected}. Update their versions together.");
foreach (var engine in engines) {
    Console.WriteLine("Ensuring " + engine + " through HtmlTinkerX.");
    await HtmlBrowser.EnsureInstalledAsync(engine);
    await using var session = await HtmlBrowser.OpenSessionAsync("about:blank", browser: engine);
    await session.Page.SetContentAsync("<title>CanopyX browser qualification</title><p>Ready</p>");
    if (await session.Page.TitleAsync() != "CanopyX browser qualification")
        throw new InvalidOperationException(engine + " did not render the installation probe.");
    Console.WriteLine(engine + " installed and launched successfully.");
}
