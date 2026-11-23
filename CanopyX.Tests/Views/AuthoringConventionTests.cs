using CanopyX.Html;
using CanopyX.Html.Ui;
using CanopyX.Tests.Changes;
using CanopyX.Tests.Protocol;

namespace CanopyX.Tests.Views;

/// <summary>The shared authoring convention: generated fluent methods over the models, and the shared Tone, ThemeMode and Icon.</summary>
public sealed class AuthoringConventionTests {
    [Fact]
    public void FluentChains_EditTheSameObjectAsInitializers() {
        var view = new CanopyDataGridView("orders", "Orders")
            .Density(CanopyGridDensity.Compact)
            .Column(new CanopyColumn("name", "Name").Sortable().Wrap())
            .Column(new CanopyColumn("amount", "Amount").Kind(CanopyColumnKind.Number))
            .Layout(layout => layout.Mode(CanopyLayoutMode.Auto).CardsBelow(720).OfferMode(CanopyLayoutMode.Auto).OfferMode(CanopyLayoutMode.Cards).OfferMode(CanopyLayoutMode.Fit));
        Assert.Equal(CanopyGridDensity.Compact, view.Density);
        Assert.Equal(new[] { "name", "amount" }, view.Columns.Select(column => column.Id));
        Assert.True(view.Columns[0].Sortable && view.Columns[0].Wrap);
        Assert.Equal(new[] { CanopyLayoutMode.Auto, CanopyLayoutMode.Cards, CanopyLayoutMode.Fit }, view.Layout!.Modes);
        ProtocolSchema.AssertValid(view.ToJson(), "grid built with fluent methods");
        var dialog = new CanopyDialog("ask", "Ask").Description("Continue?");
        Assert.Equal("Continue?", dialog.Description);
        Assert.Equal(ThemeMode.Dark, new CanopyHtmlOptions().Theme(ThemeMode.Dark).Theme);
    }

    [Fact]
    public void Icons_AreCatalogKeys_AndFreeCharactersAreMarks() {
        var view = new CanopyTreeView("files", "Files");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Icons[Icon.Named("Folder")] = SampleDocuments.FolderIcon;
        view.Roots.Add(new CanopyNode("a", "A") { Icon = Icon.Parse("folder") });
        var json = view.ToJson();
        Assert.Contains("\"icons\":{\"folder\":", json);
        Assert.Contains("\"icon\":\"folder\"", json);
        view.Roots.Add(new CanopyNode("b", "B") { Icon = Icon.Named("missing") });
        Assert.Throws<InvalidOperationException>(() => view.ToJson());

        var grid = new CanopyDataGridView("cpu", "CPU");
        grid.Columns.Add(new CanopyColumn("cpu", "CPU") { Kind = CanopyColumnKind.Number });
        grid.FormatRules.Add(CanopyFormatRule.ForCell("hot", "cpu", new CanopyFormatStyle { Tone = Tone.Danger, Icon = CanopyFormatIcons.Flag }));
        grid.FormatRules.Add(CanopyFormatRule.ForCell("own", "cpu", new CanopyFormatStyle { Tone = Tone.Warning, Mark = "!!" }));
        var formatted = grid.ToJson();
        Assert.Contains("\"icon\":\"flag\"", formatted);
        Assert.Contains("\"icon\":\"!!\"", formatted);
        grid.FormatRules[1].Style.Icon = CanopyFormatIcons.Star;
        Assert.Throws<InvalidOperationException>(() => grid.ToJson());
        grid.FormatRules[1].Style.Mark = null;
        grid.FormatRules[1].Style.Icon = Icon.Named("tabler:server");
        Assert.Throws<InvalidOperationException>(() => grid.ToJson());
        // A mark shares the wire field with icon names, so one spelled like an icon would draw the icon, or nothing.
        grid.FormatRules[1].Style.Icon = Icon.None;
        foreach (var reserved in new[] { "up", "none", "auto" }) {
            grid.FormatRules[1].Style.Mark = reserved;
            Assert.Contains("name of a formatting icon", Assert.Throws<InvalidOperationException>(() => grid.ToJson()).Message);
        }
    }

    [Fact]
    public void ToneNamesTheProtocolCannotCarry_AreRefusedWhenADocumentIsRead() {
        Assert.Equal("1st", Tone.Named("1st").Name);
        var changes = ChangeViewTests.List().ToJson();
        Assert.Contains("\"tone\":\"danger\"", changes);
        Assert.Contains("invalid tone", Assert.Throws<InvalidOperationException>(() => CanopyChangeList.FromJson(changes.Replace("\"tone\":\"danger\"", "\"tone\":\"1st\""))).Message);

        var matrix = new CanopyMatrix("checks", "Checks").State("bad", "Failing", Tone.Danger, CanopyMatrixSymbol.Cross);
        matrix.Rows.Item("r", "Server");
        matrix.Columns.Item("dns", "DNS");
        matrix.Set("r", "dns", "bad");
        var json = matrix.ToJson();
        Assert.Contains("\"tone\":\"danger\"", json);
        Assert.Throws<InvalidOperationException>(() => CanopyMatrix.FromJson(json.Replace("\"tone\":\"danger\"", "\"tone\":\"1st\"")));
        matrix.States[0].Tone = Tone.Named("1st");
        Assert.Contains("The state 'bad' has an invalid tone", Assert.Throws<InvalidOperationException>(() => matrix.ToJson()).Message);
    }
}
