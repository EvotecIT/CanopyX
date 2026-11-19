using CanopyX.Html.Ui;

namespace CanopyX.Tests.Html;

/// <summary>Markup, escaping and validation of the notification region and gallery builders.</summary>
public sealed class UiNoticeBuilderTests {
    [Fact]
    public void Toasts_WriteARegionTheRuntimeReadsAndAListWithoutIt() {
        var region = new CanopyToasts("notices", new CanopyToastsOptions { Position = CanopyToastPosition.TopCenter, Max = 2, Timeout = 8000, Label = "Report notices" });
        region.Items.Add(new CanopyToast("Collected <42> servers") { Id = "collected", Title = "Done", Tone = CanopyTone.Success, Timeout = 0 });
        region.Items.Add(new CanopyToast("Two hosts did not answer") { Tone = CanopyTone.Named("high") });

        var html = region.ToHtmlFragment();

        Assert.StartsWith("<section id=\"notices\" class=\"cx-toasts\" data-cx-toasts data-cx-part=\"toasts\" data-position=\"top-center\" data-max=\"2\" data-timeout=\"8000\" aria-label=\"Report notices\">", html);
        Assert.Contains("<li class=\"cx-toast\" data-cx-part=\"toast\" data-toast-id=\"collected\" data-tone=\"success\" data-timeout=\"0\"><strong class=\"cx-toast-title\">Done</strong> <p class=\"cx-toast-message\">Collected &lt;42&gt; servers</p></li>", html);
        Assert.Contains("<li class=\"cx-toast\" data-cx-part=\"toast\" data-tone=\"high\"><p class=\"cx-toast-message\">Two hosts did not answer</p></li>", html);
        Assert.EndsWith("</ol></section>", html);
        Assert.Contains("data-position=\"bottom-end\"", new CanopyToasts("empty").ToHtmlFragment());
    }

    [Fact]
    public void Toasts_RefuseWhatTheRuntimeCouldNotHonor() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyToasts("a", new CanopyToastsOptions { Max = 0 }).ToHtmlFragment());
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyToasts("a", new CanopyToastsOptions { Timeout = -1 }).ToHtmlFragment());
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyToasts("a", new CanopyToastsOptions { Position = (CanopyToastPosition)42 }).ToHtmlFragment());
        Assert.Throws<ArgumentException>(() => new CanopyToast(" "));
        var twice = new CanopyToasts("a");
        twice.Items.Add(new CanopyToast("One") { Id = "same" });
        twice.Items.Add(new CanopyToast("Two") { Id = "same" });
        Assert.Throws<ArgumentException>(() => twice.ToHtmlFragment());
        var late = new CanopyToasts("a");
        late.Items.Add(new CanopyToast("Late") { Timeout = 600001 });
        Assert.Throws<ArgumentOutOfRangeException>(() => late.ToHtmlFragment());
    }

    [Fact]
    public void Gallery_LinksEveryThumbnailToItsItemAndCarriesContentInTemplates() {
        var gallery = new CanopyGallery("photos", new CanopyGalleryOptions { Loop = true });
        gallery.Items.Add(new CanopyGalleryItem("images/rack-a.jpg", "Rack \"A\"") { ThumbnailHref = "images/rack-a-small.jpg", Caption = "After <the> move", Width = 320, Height = 240 });
        gallery.Items.Add(new CanopyGalleryItem("manual.pdf", "Manual") { Type = CanopyGalleryItemType.Frame });
        gallery.Items.Add(new CanopyGalleryItem("unused", "Inventory") { Type = CanopyGalleryItemType.Content, ContentHtml = "<h3>Inventory</h3>", Caption = "Inventory" });

        var html = new CanopyGallery("plain", new CanopyGalleryOptions { ShowCaptions = false }) { Items = { new CanopyGalleryItem("a.png", "A") { Caption = "Hidden" } } }.ToHtmlFragment();
        Assert.DoesNotContain("<figcaption>", html);
        html = gallery.ToHtmlFragment();

        Assert.StartsWith("<div id=\"photos\" class=\"cx-gallery\" data-cx-lightbox data-cx-part=\"gallery\" data-loop=\"true\"><ul class=\"cx-gallery-list\">", html);
        Assert.Contains("<a class=\"cx-gallery-link\" data-lightbox-item href=\"images/rack-a.jpg\" data-caption=\"After &lt;the&gt; move\"><img loading=\"lazy\" decoding=\"async\" src=\"images/rack-a-small.jpg\" alt=\"Rack &quot;A&quot;\" width=\"320\" height=\"240\"></a><figcaption>After &lt;the&gt; move</figcaption>", html);
        Assert.Contains("<a class=\"cx-gallery-link\" data-lightbox-item href=\"manual.pdf\" data-lightbox-type=\"frame\"><span class=\"cx-gallery-label\">Manual</span></a>", html);
        Assert.Contains("href=\"#photos-item-2\" data-lightbox-type=\"content\"", html);
        Assert.EndsWith("</ul><template id=\"photos-item-2\"><h3>Inventory</h3></template></div>", html);
    }

    [Fact]
    public void Gallery_RefusesScriptAddressesAndEmptyContent() {
        foreach (var address in new[] { "javascript:alert(1)", " JavaScript:alert(1)", "vbscript:x", "data:text/html,<script>x</script>" }) {
            var gallery = new CanopyGallery("g");
            gallery.Items.Add(new CanopyGalleryItem(address, "Bad"));
            Assert.Throws<ArgumentException>(() => gallery.ToHtmlFragment());
        }
        var thumbnail = new CanopyGallery("g");
        thumbnail.Items.Add(new CanopyGalleryItem("a.png", "A") { ThumbnailHref = "javascript:x" });
        Assert.Throws<ArgumentException>(() => thumbnail.ToHtmlFragment());
        var content = new CanopyGallery("g");
        content.Items.Add(new CanopyGalleryItem("x", "X") { Type = CanopyGalleryItemType.Content });
        Assert.Throws<ArgumentException>(() => content.ToHtmlFragment());
        Assert.Throws<ArgumentException>(() => new CanopyGallery("g").ToHtmlFragment());
        var data = new CanopyGallery("g");
        data.Items.Add(new CanopyGalleryItem("data:image/png;base64,AAAA", "Inline"));
        Assert.Contains("src=\"data:image/png;base64,AAAA\"", data.ToHtmlFragment());
    }
}
