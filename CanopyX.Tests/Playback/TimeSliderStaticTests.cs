using System.Globalization;
using System.Text.RegularExpressions;
using CanopyX.Rendering;
using Xunit;
using static CanopyX.Tests.Playback.TimeSliderFixtures;

namespace CanopyX.Tests.Playback;

public sealed class TimeSliderStaticTests {
    [Theory]
    [InlineData(null, "Latest matrix", 1)]
    [InlineData(0, "Earlier matrix", 0)]
    public void MatrixFallback_RendersSelectedFrameTimestampLabelsAndRowLimit(int? initial, string expected, int minute) {
        var view = MatrixSlider();
        view.TimeSlider!.InitialIndex = initial;
        var frame = view.TimeSlider.Snapshots[initial ?? 1];
        frame.Label = "<selected>";
        frame.View.Labels = new CanopyLabels { MatrixRows = "Host row title" };
        var html = CanopyStaticHtml.RenderMatrix(view, new CanopyStaticHtmlOptions { MaxRows = 1 });
        Assert.Contains(expected, html);
        Assert.DoesNotContain(initial == 0 ? "Latest matrix" : "Earlier matrix", html);
        Assert.DoesNotContain("Parent matrix", html);
        Assert.Contains("&lt;selected&gt;", html);
        Assert.Contains("<time datetime=\"" + At.AddMinutes(minute).UtcDateTime.ToString("O", CultureInfo.InvariantCulture) + "\">", html);
        Assert.Contains("Host row title", html);
        Assert.Single(Regex.Matches(html, "scope=\"row\""));
        Assert.DoesNotContain("<script", html);
        Assert.Equal("Parent matrix", view.Label);
    }

    [Theory]
    [InlineData(null, "Latest rollout", 1)]
    [InlineData(0, "Earlier rollout", 0)]
    public void PropagationFallback_RendersSelectedEvidenceAndTimestampWithCaptionOverride(int? initial, string expected, int minute) {
        var view = PropagationSlider();
        view.TimeSlider!.InitialIndex = initial;
        view.TimeSlider.Snapshots[initial ?? 1].View.Labels = new CanopyLabels { ChangeReplica = "Host service title" };
        var html = CanopyStaticHtml.RenderPropagation(view, new CanopyStaticHtmlOptions { Caption = "Report", MaxRows = 1 });
        Assert.Contains("Report<br>", html);
        Assert.Contains(expected + " East", html);
        Assert.DoesNotContain(expected + " West", html);
        Assert.DoesNotContain(initial == 0 ? "Latest rollout" : "Earlier rollout", html);
        Assert.Contains("Host service title", html);
        Assert.Contains("<time datetime=\"" + At.AddMinutes(minute).UtcDateTime.ToString("O", CultureInfo.InvariantCulture) + "\">", html);
        Assert.Single(Regex.Matches(html, "scope=\"row\""));
        Assert.DoesNotContain("<script", html);
    }

    [Fact]
    public void MatrixFallback_AppliesCellBudgetToTheSelectedFrame() {
        var view = MatrixSlider();
        var large = MakeMatrix("Large selected frame", rows: CanopyStaticHtml.MaxStaticMatrixCells + 1);
        large.Cells[0].State = "late";
        view.TimeSlider!.Snapshots[1] = new(At.AddMinutes(1), large);
        var html = CanopyStaticHtml.RenderMatrix(view, new CanopyStaticHtmlOptions { MaxRows = 1 });
        Assert.Contains("Large selected frame service 0", html);
        Assert.DoesNotContain("Large selected frame service 1", html);
        Assert.Contains("Delayed", html);
        Assert.DoesNotContain("scope=\"row\"", html);
        Assert.Contains("<time datetime=", html);
    }

    [Fact]
    public void Fallback_RejectsCyclesBeforeSelectingAFrame() {
        var matrix = MatrixSlider();
        matrix.TimeSlider!.Snapshots[0] = new(At, matrix);
        Assert.Contains("nested time slider", Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.RenderMatrix(matrix)).Message);
        var propagation = PropagationSlider();
        propagation.TimeSlider!.Snapshots[0] = new(At, propagation);
        Assert.Contains("nested time slider", Assert.Throws<InvalidOperationException>(() => CanopyStaticHtml.RenderPropagation(propagation)).Message);
    }

    [Fact]
    public void Fallback_DisclosesTimestampWhenCaptionIsSuppressed() {
        var matrix = CanopyStaticHtml.RenderMatrix(MatrixSlider(), new CanopyStaticHtmlOptions { Caption = "" });
        var propagation = CanopyStaticHtml.RenderPropagation(PropagationSlider(), new CanopyStaticHtmlOptions { Caption = "" });
        Assert.Contains("<time datetime=", matrix);
        Assert.Contains("<time datetime=", propagation);
    }
}
