using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a notification region: toasts in a queue with an announced live region (docs/ui-toasts.md).</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. Without the runtime the written toasts read as a list.
/// Script shows more with <c>CanopyX.notify</c> or the region's <c>show</c>. This builder emits no assets or executable code.</remarks>
public sealed class CanopyToasts {
    /// <summary>Creates a region with a page-unique identity.</summary>
    public CanopyToasts(string id, CanopyToastsOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Options = options ?? new CanopyToastsOptions();
    }

    /// <summary>Gets the root DOM identity.</summary>
    public string Id { get; }
    /// <summary>Gets the toasts the page opens with, shown in order through the queue.</summary>
    public IList<CanopyToast> Items { get; } = new List<CanopyToast>();
    /// <summary>Gets the typed options.</summary>
    public CanopyToastsOptions Options { get; }

    /// <summary>Renders the region with encoded text.</summary>
    /// <exception cref="ArgumentException">A toast is null, or two toasts share an identity.</exception>
    /// <exception cref="ArgumentOutOfRangeException">An option or a toast timeout is out of range.</exception>
    public string ToHtmlFragment() {
        UiHtml.EnumValue(Options.Position);
        if (Options.Max < 1 || Options.Max > 10) throw new ArgumentOutOfRangeException(nameof(Options.Max), "A region shows 1 to 10 toasts at once.");
        Timeout(Options.Timeout, nameof(Options.Timeout));
        if (Options.Label != null) UiHtml.Text(Options.Label, nameof(Options.Label));
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var html = new StringBuilder("<section");
        UiHtml.Attribute(html, "id", Id);
        html.Append(" class=\"cx-toasts\" data-cx-toasts data-cx-part=\"toasts\"");
        UiHtml.Attribute(html, "data-cx-variant", Options.Variant);
        UiHtml.Attribute(html, "data-position", UiHtml.Token(Options.Position));
        UiHtml.Attribute(html, "data-max", UiHtml.Number(Options.Max));
        UiHtml.Attribute(html, "data-timeout", UiHtml.Number(Options.Timeout));
        UiHtml.Attribute(html, "aria-label", Options.Label);
        html.Append("><ol class=\"cx-toasts-list\">");
        foreach (var toast in Items) {
            if (toast == null) throw new ArgumentException("Items cannot contain null entries.");
            if (toast.Id != null) UiHtml.Unique(ids, toast.Id);
            // The runtime reads these toasts back with the limits it applies to script, so a written toast always shows.
            Limit(toast.Id, 128, nameof(toast.Id));
            Limit(toast.Title, 200, nameof(toast.Title));
            Limit(toast.Message, 2000, nameof(toast.Message));
            if (toast.Timeout != null) Timeout(toast.Timeout.Value, nameof(toast.Timeout));
            html.Append("<li class=\"cx-toast\" data-cx-part=\"toast\"");
            UiHtml.Attribute(html, "data-toast-id", toast.Id);
            UiHtml.Attribute(html, "data-tone", toast.Tone.Name);
            if (toast.Timeout != null) UiHtml.Attribute(html, "data-timeout", UiHtml.Number(toast.Timeout.Value));
            html.Append('>');
            if (toast.Title != null) html.Append("<strong class=\"cx-toast-title\">").Append(UiHtml.Encode(toast.Title)).Append("</strong> ");
            html.Append("<p class=\"cx-toast-message\">").Append(UiHtml.Encode(toast.Message)).Append("</p></li>");
        }
        return html.Append("</ol></section>").ToString();
    }

    private static void Limit(string? value, int max, string name) {
        if (value != null && value.Length > max) throw new ArgumentOutOfRangeException(name, "A toast " + name.ToLowerInvariant() + " has at most " + max + " characters.");
    }

    private static void Timeout(int value, string name) {
        if (value < 0 || value > 600000) throw new ArgumentOutOfRangeException(name, "A timeout is 0 to 600000 milliseconds.");
    }
}
