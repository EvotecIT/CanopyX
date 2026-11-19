using CanopyX.Html.Ui;

namespace CanopyX.Tests.Html;

/// <summary>Stepper toolbars above, under or around the panels, with host controls.</summary>
public sealed class UiStepperToolbarTests {
    private static CanopyStepper Stepper(CanopyStepperToolbarPosition position, string? extra = null) {
        var stepper = new CanopyStepper("wizard", "Setup", new CanopyStepperOptions { ShowFooter = true, ToolbarPosition = position, ToolbarHtml = extra });
        stepper.Steps.Add(new CanopyStep("one", "One") { ContentHtml = "<p>One</p>" });
        stepper.Steps.Add(new CanopyStep("two", "Two") { ContentHtml = "<p>Two</p>" });
        return stepper;
    }

    [Fact]
    public void Toolbar_ShowsWhereItIsAskedAndKeepsHostControlsFirst() {
        var bottom = Stepper(CanopyStepperToolbarPosition.Bottom).ToHtmlFragment();
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(bottom, "cx-stepper-footer\""));
        Assert.DoesNotContain("data-placement", bottom);
        var both = Stepper(CanopyStepperToolbarPosition.Both, "<a href=\"#help\">Help</a>").ToHtmlFragment();
        Assert.Equal(2, System.Text.RegularExpressions.Regex.Matches(both, "cx-stepper-footer\"").Count);
        Assert.True(both.IndexOf("data-placement=\"top\"", StringComparison.Ordinal) < both.IndexOf("id=\"wizard-panel-one\"", StringComparison.Ordinal));
        Assert.Contains("<span class=\"cx-step-position\">Step 1 of 2</span><span class=\"cx-stepper-extra\" data-cx-part=\"extra\"><a href=\"#help\">Help</a></span>", both);
        var top = Stepper(CanopyStepperToolbarPosition.Top).ToHtmlFragment();
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(top, "cx-stepper-footer\""));
        Assert.Contains("data-placement=\"top\"", top);
        Assert.Throws<ArgumentOutOfRangeException>(() => Stepper((CanopyStepperToolbarPosition)9).ToHtmlFragment());
    }
}
