using CanopyX.Html;
using CanopyX.Rendering;
using Xunit;

namespace CanopyX.Tests.NetFramework.DataViews;

/// <summary>Runs the new public workflow against the .NET Framework assemblies and their embedded assets.</summary>
public sealed class DataViewFrameworkTests {
    [Fact]
    public void KeyedComparisonAndValidatedViewIntent_RetainTypesAndEscapingOnNetFramework() {
        var before = new CanopyGridRow("item"); before.Cells["units"] = "<script>";
        var after = new CanopyGridRow("item"); after.Cells["units"] = 12;
        var comparison = CanopyDatasetComparer.Compare(new[] { before }, new[] { after });
        Assert.Equal(1, comparison.Counts.Changed);
        var view = comparison.ToView("inventory", "Inventory changes", new[] {
            new CanopyColumn("units", "Units") { Kind = CanopyColumnKind.Number }
        });
        view.ViewIntents = true;
        var cell = view.Rows[0].Cells["units"];
        Assert.Equal("<script>", cell.Changes[0].Before!.Value);
        Assert.Equal(12L, cell.Value);
        var intent = CanopyViewIntentValidator.Validate(
            "{\"protocol\":\"canopyx/2\",\"type\":\"viewIntent\",\"version\":1,\"view\":\"inventory\",\"query\":{\"filters\":[{\"column\":\"units\",\"operator\":\"ge\",\"values\":[10]}]}}", view);
        Assert.Contains("\"operator\":\"ge\"", intent.ToJson());
        var email = CanopyStaticHtml.RenderComparison(view);
        Assert.Contains("&lt;script&gt;", email);
        Assert.DoesNotContain("<script", email);
        var fragment = view.ToHtmlFragment();
        Assert.Contains("application/x-canopyx-compare", fragment);
        Assert.Contains("application/x-canopyx-view-intents", fragment);
    }
}
