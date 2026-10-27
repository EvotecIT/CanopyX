using System.Globalization;
using System.Text.RegularExpressions;
using CanopyX.Html;
using CanopyX.Rendering;
using CanopyX.Tests.Protocol;
using Xunit;

namespace CanopyX.Tests.Changes;

/// <summary>The change list and the propagation view: documents, checks, the static fallbacks and the HTML writers.</summary>
public sealed class ChangeViewTests {
    private static readonly DateTimeOffset At = new DateTimeOffset(2026, 10, 21, 10, 42, 0, TimeSpan.Zero);

    internal static CanopyChangeList List() {
        var list = new CanopyChangeList("files", "File changes");
        list.Action("copy", "Copy path", CanopyChangeActionIcon.Copy, copy: "unc").Action("ack", "Acknowledge", CanopyChangeActionIcon.Check);
        var exe = list.Add("exe", CanopyChangeKind.Added, "Machine/Scripts/run.exe");
        exe.After = new CanopyChangeVersion { Size = 2048, Hash = "0123456789abcdef0123", Time = At };
        exe.Flag("unsigned", "Unsigned", "No embedded signature.", CanopyTone.Danger).Fact("Signer", null, "Not signed", CanopyTone.Danger);
        exe.Values["unc"] = "\\\\dc01\\share\\run.exe";
        var script = list.Add("ps1", CanopyChangeKind.Modified, "Machine/Scripts/logon.ps1");
        script.Before = new CanopyChangeVersion { Size = 100, Hash = "aaaaaaaaaaaa" };
        script.After = new CanopyChangeVersion { Size = 120, Hash = "bbbbbbbbbbbb", Time = At };
        script.Diff = CanopyTextDiff.FromTexts("ps1-diff", "logon.ps1", "a\n", "b\n", compare: true);
        script.Actions.Add("ack");
        list.Add("ini", CanopyChangeKind.Renamed, "gpt.ini").PreviousPath = "old.ini";
        list.Add("gone", CanopyChangeKind.Removed, "User/old.vbs").Before = new CanopyChangeVersion { Size = 5 };
        return list;
    }

    internal static CanopyPropagation Propagation() {
        var view = new CanopyPropagation("prop", "Propagation") { Start = At, AsOf = At.AddMinutes(120), Title = "Domain controller", GroupCount = "[one]{count} DC[other]{count} DCs" };
        var dc1 = view.Witness("dc1", "DC01", CanopyPropagationState.Converged); dc1.FirstSeen = At; dc1.LastSeen = At.AddMinutes(29); dc1.Source = true; dc1.Group = "Oslo";
        var dc2 = view.Witness("dc2", "DC02", CanopyPropagationState.Converged); dc2.FirstSeen = At.AddMinutes(75.0 / 60); dc2.LastSeen = At.AddMinutes(29); dc2.Group = "Oslo";
        var dc3 = view.Witness("dc3", "DC03", CanopyPropagationState.Fault); dc3.FirstSeen = At.AddHours(26).AddMinutes(-1500); dc3.LastSeen = At.AddMinutes(90); dc3.Note = "Hash differs."; dc3.Group = "Lyon";
        view.Witness("dc4", "DC04", CanopyPropagationState.Unknown).Group = "Lyon";
        return view;
    }

    [Fact]
    public void ChangeList_RoundTripsAndMatchesTheSchema() {
        var list = List();
        list.TimeZone = CanopyTimeZone.Local;
        list.HashLength = 12;
        var json = list.ToJson();
        ProtocolSchema.AssertValid(json, "Change list writer");
        Assert.Contains("\"kind\":\"added\"", json);
        Assert.Contains("\"time\":\"2026-10-21T10:42:00Z\"", json);
        Assert.Contains("\"diff\":{\"id\":\"ps1-diff\"", json);
        Assert.Contains("\"timeZone\":\"local\"", json);
        Assert.Equal(json, CanopyChangeList.FromJson(json).ToJson());
    }

    [Theory]
    [InlineData("renamed without a previous path")]
    [InlineData("added with a previous path")]
    [InlineData("undeclared action")]
    [InlineData("duplicate item")]
    [InlineData("duplicate flag")]
    [InlineData("fact without a value")]
    [InlineData("negative size")]
    [InlineData("hash length")]
    [InlineData("path with a line break")]
    public void ChangeList_RefusesInvalidLists(string defect) {
        var list = List();
        switch (defect) {
            case "renamed without a previous path": list.Items[2].PreviousPath = null; break;
            case "added with a previous path": list.Items[0].PreviousPath = "x"; break;
            case "undeclared action": list.Items[0].Actions.Add("nope"); break;
            case "duplicate item": list.Add("exe", CanopyChangeKind.Added, "x"); break;
            case "duplicate flag": list.Items[0].Flag("unsigned", "Again", "Twice."); break;
            case "fact without a value": list.Items[0].Fact("Owner", null, null); break;
            case "negative size": list.Items[0].After!.Size = -1; break;
            case "hash length": list.HashLength = 3; break;
            case "path with a line break": list.Items[0].Path = "a\nb"; break;
        }

        Assert.Throws<InvalidOperationException>(() => list.Validate());
    }

    internal static CanopyChangeList ListWithTools() {
        var list = List();
        list.Actions.Add(new CanopyChangeAction("diff", "Open the diff") { Icon = CanopyChangeActionIcon.Diff, Reveal = CanopyChangeReveal.Diff });
        list.Actions.Add(new CanopyChangeAction("why", "Mark as expected") { Icon = CanopyChangeActionIcon.Check, Reason = true });
        list.Values["object"] = "#gpo/contoso/1";
        list.Tool(new CanopyChangeAction("open", "Open the object") { Icon = CanopyChangeActionIcon.Open, Link = "object" })
            .Tool(new CanopyChangeAction("ack-all", "Acknowledge all") { Icon = CanopyChangeActionIcon.Check, Reason = true });
        list.Exports = CanopyChangeExports.Csv | CanopyChangeExports.Json;
        return list;
    }

    [Fact]
    public void ChangeList_RoundTripsItsBarActionsValuesAndExports() {
        var json = ListWithTools().ToJson();
        ProtocolSchema.AssertValid(json, "Change list writer with a bar");
        Assert.Contains("\"toolbar\":[{\"id\":\"open\",\"label\":\"Open the object\",\"icon\":\"open\",\"link\":\"object\"}", json);
        Assert.Contains("\"reveal\":\"diff\"", json);
        Assert.Contains("\"reason\":true", json);
        Assert.Contains("\"exports\":[\"csv\",\"json\"]", json);
        Assert.Contains("\"values\":{\"object\":\"#gpo/contoso/1\"}", json);
        var read = CanopyChangeList.FromJson(json);
        Assert.Equal(CanopyChangeExports.Csv | CanopyChangeExports.Json, read.Exports);
        Assert.Equal(json, read.ToJson());
    }

    [Theory]
    [InlineData("copy and link")]
    [InlineData("reason with copy")]
    [InlineData("bar reveal")]
    [InlineData("bar value missing")]
    [InlineData("bar id clash")]
    [InlineData("unknown export")]
    [InlineData("too many list values")]
    public void ChangeList_RefusesInvalidBarsAndActions(string defect) {
        var list = ListWithTools();
        switch (defect) {
            case "copy and link": list.Actions[0].Link = "unc"; break;
            case "reason with copy": list.Actions[0].Reason = true; break;
            case "bar reveal": list.Toolbar[1].Reveal = CanopyChangeReveal.Details; break;
            case "bar value missing": list.Toolbar[0].Link = "nope"; break;
            case "bar id clash": list.Tool(new CanopyChangeAction("ack", "Again")); break;
            case "unknown export": list.Exports = (CanopyChangeExports)4; break;
            case "too many list values": for (var i = 0; i < 17; i++) list.Values["k" + i] = "v"; break;
        }

        Assert.Throws<InvalidOperationException>(() => list.Validate());
    }

    [Fact]
    public void Propagation_RoundTripsAndTakesTheWorstStateWhenItHasNone() {        var view = Propagation();
        Assert.Equal(CanopyPropagationState.Fault, view.OverallState);
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "Propagation writer");
        Assert.DoesNotContain("\"state\":\"fault\",\"summary\"", json);
        Assert.Equal(json, CanopyPropagation.FromJson(json).ToJson());
        view.State = CanopyPropagationState.Propagating;
        Assert.Equal(CanopyPropagationState.Propagating, view.OverallState);
        view.Witnesses[0].LastSeen = At.AddMinutes(-1);
        Assert.Throws<InvalidOperationException>(() => view.Validate());
        var bad = Propagation(); bad.GroupCount = "DCs";
        Assert.Throws<InvalidOperationException>(() => bad.Validate());
        Assert.Throws<InvalidOperationException>(() => new CanopyPropagation("e", "Empty").Validate());
    }

    [Fact]
    public void RenderChanges_ShowsBadgesFlagsAndFoldersWithoutScript() {
        var html = CanopyStaticHtml.RenderChanges(List());
        Assert.DoesNotContain("<script", html);
        Assert.Contains("print-color-adjust:exact;", html);
        Assert.Equal(new[] { "(root)|1", "Machine/Scripts|2", "User|1" }, Regex.Matches(html, "scope=\"rowgroup\"[^>]*>([^<]*) <span[^>]*>· (\\d+) files?</span>")
            .Select(match => (match.Groups[1].Value == "Top level" ? "(root)" : match.Groups[1].Value) + "|" + match.Groups[2].Value));
        Assert.Contains(">Added</span>", html);
        Assert.Contains(">⚑ Unsigned</span> No embedded signature.", html);
        Assert.Contains(">01234567…</td>", html);
        Assert.Contains(">2 KB</td>", html);
        Assert.Contains("100 B → 120 B", html.Replace("&#8594;", "→"));
        Assert.Contains("from old.ini", html);
        var limited = CanopyStaticHtml.RenderChanges(List(), new CanopyStaticHtmlOptions { MaxRows = 2 });
        Assert.Contains("Showing 2 of 4 rows.", limited);
    }

    [Fact]
    public void RenderDiff_SignsEveryChangeAndMarksTheChangedWords() {
        var diff = CanopyTextDiff.FromTexts("d", "settings.ini", "[agent]\nchannel=stable\n" + string.Concat(Enumerable.Range(1, 12).Select(i => "k" + i + "=v\n")) + "end\n",
            "[agent]\nchannel=preview\n" + string.Concat(Enumerable.Range(1, 12).Select(i => "k" + i + "=v\n")) + "END\n", compare: true);
        diff.Path = "Config/settings.ini";
        var html = CanopyStaticHtml.RenderDiff(diff);
        Assert.DoesNotContain("<script", html);
        Assert.Contains(">−</td>", html);
        Assert.Contains(">+</td>", html);
        Assert.Matches("channel=<del style=\"[^\"]*\">stable</del>", html);
        Assert.Matches("channel=<ins style=\"[^\"]*\">preview</ins>", html);
        Assert.Contains("unchanged lines not included", html);
        Assert.Contains(">+2</span>", html);
        var binary = CanopyStaticHtml.RenderDiff(new CanopyTextDiff("b", "agent.exe") { Content = CanopyDiffContent.Binary });
        Assert.Contains(new CanopyLabels().ChangeBinary, binary);
    }

    [Fact]
    public void RenderPropagation_ShowsStatesWithSymbolsDelaysAndGroups() {
        var html = CanopyStaticHtml.RenderPropagation(Propagation(), new CanopyStaticHtmlOptions { Culture = CultureInfo.GetCultureInfo("en-US") });
        Assert.Contains("✕ Fault</span> 2 of 4 have the change", html);
        Assert.Contains(">Domain controller</th>", html);
        Assert.Contains("· 2 DCs</span>", html);
        Assert.Contains("+1 min", html);
        Assert.Contains("+1 h", html);
        Assert.Contains("Not seen yet", html);
        Assert.Contains("21 Oct 2026, 10:42&#160;UTC", html);
        Assert.DoesNotContain("<script", html);
    }

    [Fact]
    public void Html_WritesFragmentsWithTheChangesPartOnNaturalHeightHosts() {
        foreach (var fragment in new[] { List().ToHtmlFragment(), Propagation().ToHtmlFragment(), CanopyTextDiff.FromTexts("d", "D", "a", "b").ToHtmlFragment() }) {
            Assert.Contains("class=\"cx-host cx-change-host\" data-canopyx-host", fragment);
            Assert.Contains("application/x-canopyx-changes", fragment);
            Assert.DoesNotContain("application/x-canopyx-matrix", fragment);
        }

        Assert.Equal(CanopyRuntime.DataGrid, CanopyHtmlAssets.GetRuntime(List()));
        Assert.Equal(new[] { "changes" }, CanopyHtmlAssets.GetRequiredParts(Propagation()).Select(part => part.Name));
        var page = List().ToHtmlPage(new CanopyHtmlOptions { Nonce = "n0nce", Height = "400px" });
        Assert.Contains("<title>File changes</title>", page);
        Assert.Contains("data-cx-height=\"400px\"", page);
        Assert.Contains("nonce=\"n0nce\"", page);
    }
}
