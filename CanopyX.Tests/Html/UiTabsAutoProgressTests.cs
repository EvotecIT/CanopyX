using System.Xml.Linq;
using CanopyX.Html.Ui;

namespace CanopyX.Tests.Html;

/// <summary>Declarative auto-progression settings and the localized control contract consumed by tabs.</summary>
public sealed class UiTabsAutoProgressTests {
    [Fact]
    public void Tabs_AutoProgressIsOptInAndEmitsDefaultSettingsWhenEnabled() {
        var tabs = CreateTabs();
        Assert.Null(tabs.Options.AutoProgress);
        Assert.Null(Parse(tabs).Attribute("data-auto-progress-interval"));

        tabs.Options.AutoProgress = new CanopyTabsAutoProgress();
        var root = Parse(tabs);
        Assert.Equal("5000", (string?)root.Attribute("data-auto-progress-interval"));
        Assert.Equal("true", (string?)root.Attribute("data-auto-progress-pause-on-hover"));
        Assert.Equal("true", (string?)root.Attribute("data-auto-progress-pause-on-focus"));
        Assert.Empty(root.DescendantsAndSelf().Attributes("hidden"));
        Assert.Empty(root.Descendants("script"));
    }

    [Theory]
    [InlineData(1, true, false)]
    [InlineData(7500, false, true)]
    [InlineData(int.MaxValue, false, false)]
    public void Tabs_AutoProgressProjectsIntervalAndIndependentPauseSettings(int interval, bool hover, bool focus) {
        var tabs = CreateTabs();
        tabs.Options.AutoProgress = new CanopyTabsAutoProgress {
            Interval = interval, PauseOnHover = hover, PauseOnFocus = focus
        };

        var root = Parse(tabs);
        Assert.Equal(interval, (int?)root.Attribute("data-auto-progress-interval"));
        Assert.Equal(hover, (bool?)root.Attribute("data-auto-progress-pause-on-hover"));
        Assert.Equal(focus, (bool?)root.Attribute("data-auto-progress-pause-on-focus"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Tabs_AutoProgressRejectsNonPositiveIntervals(int interval) {
        var tabs = CreateTabs();
        tabs.Options.AutoProgress = new CanopyTabsAutoProgress { Interval = interval };
        Assert.Throws<ArgumentOutOfRangeException>(() => tabs.ToHtmlFragment());
    }

    [Theory]
    [InlineData("en", "Pause", "Play", "Automatic tabs are disabled by reduced motion")]
    [InlineData("pl", "Wstrzymaj", "Odtwórz", "Automatyczne przełączanie kart jest wyłączone przy ograniczeniu ruchu")]
    [InlineData("de", "Pausieren", "Wiedergeben", "Automatischer Tabwechsel ist bei reduzierter Bewegung deaktiviert")]
    [InlineData("es", "Pausar", "Reproducir", "El cambio automático de pestañas está desactivado con movimiento reducido")]
    [InlineData("fr", "Mettre en pause", "Lire", "Le changement automatique d’onglet est désactivé lorsque les animations sont réduites")]
    [InlineData("it", "Pausa", "Riproduci", "Il cambio automatico delle schede è disattivato con movimento ridotto")]
    public void Labels_ExposeLocalizedProgressionControls(string locale, string pause, string play, string disabled) {
        var labels = locale switch {
            "pl" => CanopyLabels.Polish(), "de" => CanopyLabels.German(), "es" => CanopyLabels.Spanish(),
            "fr" => CanopyLabels.French(), "it" => CanopyLabels.Italian(), _ => new CanopyLabels()
        };
        Assert.Equal(pause, labels.TabsPause);
        Assert.Equal(play, labels.TabsPlay);
        Assert.Equal(disabled, labels.TabsMotionDisabled);
    }

    private static CanopyTabs CreateTabs() {
        var tabs = new CanopyTabs("sections", "Sections");
        tabs.Tabs.Add(new CanopyTab("summary", "Summary"));
        tabs.Tabs.Add(new CanopyTab("details", "Details"));
        return tabs;
    }

    private static XElement Parse(CanopyTabs tabs) => XElement.Parse(tabs.ToHtmlFragment()
        .Replace(" data-cx-tabs ", " data-cx-tabs=\"\" "));
}
