using CanopyX.Html;
using Xunit;

namespace CanopyX.Tests.Api;

/// <summary>The public API of CanopyX and CanopyX.Html against the baselines under api/ (docs/versioning.md).</summary>
public sealed class ApiSurfaceTests {
    [Fact]
    public void CanopyX_PublicApi_MatchesTheBaseline() => ApiSurface.AssertMatches(typeof(CanopyDataGridView).Assembly, "CanopyX.txt");

    [Fact]
    public void CanopyXHtml_PublicApi_MatchesTheBaseline() => ApiSurface.AssertMatches(typeof(CanopyHtmlOptions).Assembly, "CanopyX.Html.txt");
}