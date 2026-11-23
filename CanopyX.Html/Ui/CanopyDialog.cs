using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CanopyX.Html.Ui;

/// <summary>Builds a declarative dialog with encoded accessibility references, typed actions and trusted content.</summary>
/// <remarks>Hosts load the CanopyX UI stylesheet and runtime once per page. Render a trigger separately or wire an existing control to TriggerId and data-cx-open. No assets or executable code are emitted.</remarks>
[PowerForge.Fluent.Fluent]
public sealed class CanopyDialog {
    /// <summary>Creates a dialog with a page-unique identity and a plain text title.</summary>
    public CanopyDialog(string id, string title, CanopyDialogOptions? options = null) {
        Id = UiHtml.Id(id, nameof(id));
        Title = UiHtml.Text(title, nameof(title));
        Options = options ?? new CanopyDialogOptions();
    }

    /// <summary>Gets the page-unique overlay identity.</summary>
    public string Id { get; }
    /// <summary>Gets the plain text title.</summary>
    public string Title { get; }
    /// <summary>Gets the trigger identity used by data-cx-trigger. Hosts keep it unique on the page.</summary>
    public string TriggerId => UiOverlayHtml.TriggerId(Id, Options.TriggerId);
    /// <summary>Gets or sets the plain text description, for a confirmation its question. Null makes aria-describedby reference the content body.</summary>
    public string? Description { get; set; }
    /// <summary>Gets or sets trusted body HTML, inserted without encoding or sanitization. Never pass untrusted input.</summary>
    public string ContentHtml { get; set; } = string.Empty;
    /// <summary>Gets or sets trusted footer HTML, inserted without encoding or sanitization. A dialog has either this or <see cref="Actions"/>.</summary>
    public string? FooterHtml { get; set; }
    /// <summary>Gets the typed footer buttons, in order. They replace <see cref="FooterHtml"/>; see <see cref="CanopyDialogAction"/>.</summary>
    public IList<CanopyDialogAction> Actions { get; } = new List<CanopyDialogAction>();
    /// <summary>
    /// Gets the hidden fields an action with a <see cref="CanopyDialogAction.Target"/> submits with its answer, for example the
    /// host's antiforgery token. Names are unique; <c>action</c> is reserved for the answer.
    /// </summary>
    public IDictionary<string, string> Fields { get; } = new Dictionary<string, string>(StringComparer.Ordinal);
    /// <summary>Gets the typed overlay options.</summary>
    public CanopyDialogOptions Options { get; }

    /// <summary>
    /// Creates a confirmation: an alert dialog that asks <paramref name="question"/> and answers with a cancel action, which it
    /// focuses first, and <paramref name="confirm"/>.
    /// </summary>
    /// <param name="id">The page-unique overlay identity.</param>
    /// <param name="title">The plain text title.</param>
    /// <param name="question">The plain text question, for example <c>Restart the print spooler?</c>.</param>
    /// <param name="confirm">The action that confirms, usually from <see cref="CanopyDialogAction.Submit"/>.</param>
    /// <param name="cancelLabel">The cancel button text.</param>
    public static CanopyDialog Confirm(string id, string title, string question, CanopyDialogAction confirm, string cancelLabel = "Cancel") {
        if (confirm == null) throw new ArgumentNullException(nameof(confirm));
        if (confirm.Kind != CanopyDialogActionKind.Submit) throw new ArgumentException("A confirmation needs a submit action.", nameof(confirm));
        var dialog = new CanopyDialog(id, title, new CanopyDialogOptions { Alert = true, Size = CanopyOverlaySize.Small }) { Description = UiHtml.Text(question, nameof(question)) };
        dialog.Actions.Add(CanopyDialogAction.Cancel(cancelLabel));
        dialog.Actions.Add(confirm);
        return dialog;
    }

    /// <summary>Renders a separate accessible trigger button with encoded text and declarative open metadata.</summary>
    public string ToTriggerHtmlFragment(string label) => UiOverlayHtml.Trigger(Id, TriggerId, label, "dialog");

    /// <summary>Renders the closed dialog; the host runtime owns opening, dismissal and focus management.</summary>
    /// <exception cref="InvalidOperationException">The dialog has both footer HTML and actions, two actions share an identity, or its fields have no action to submit them.</exception>
    public string ToHtmlFragment() {
        var footer = ActionsHtml();
        var html = UiOverlayHtml.Start("dialog", "dialog", Id, TriggerId, Description, Options.Alert);
        UiHtml.Attribute(html, "data-size", UiOverlayHtml.Size(Options.Size));
        UiHtml.Attribute(html, "data-modal", "true");
        UiHtml.Attribute(html, "aria-modal", "true");
        UiHtml.Attribute(html, "data-dismissible", UiHtml.Bool(Options.Dismissible ?? !Options.Alert));
        return UiOverlayHtml.Finish(html, "dialog", "dialog", Id, Title, Description, ContentHtml, FooterHtml, Options.Alert ? null : Options.CloseLabel, footer);
    }

    // The actions become the footer. With a submit target the footer is a form, so the buttons submit without the runtime.
    private string? ActionsHtml() {
        if (Actions.Count == 0) {
            if (Fields.Count != 0) throw new InvalidOperationException("Dialog fields are submitted by an action with a target.");
            return null;
        }
        if (FooterHtml != null) throw new InvalidOperationException("A dialog has either footer HTML or actions, not both.");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var action in Actions) {
            if (action == null) throw new InvalidOperationException("Dialog actions cannot be null.");
            if (!ids.Add(action.Id)) throw new InvalidOperationException("Duplicate dialog action: " + action.Id);
        }
        var submits = Actions.Any(action => action.Target != null);
        if (Fields.Count != 0 && !submits) throw new InvalidOperationException("Dialog fields are submitted by an action with a target.");
        var tag = submits ? "form" : "footer";
        var html = new StringBuilder("<").Append(tag);
        UiHtml.Attribute(html, "class", "cx-dialog-footer");
        UiHtml.Attribute(html, "data-cx-part", "footer");
        if (submits) UiHtml.Attribute(html, "method", "post");
        html.Append('>');
        foreach (var field in Fields) {
            if (string.IsNullOrEmpty(field.Key) || field.Key == "action") throw new InvalidOperationException("A dialog field needs a name other than action.");
            html.Append("<input type=\"hidden\"");
            UiHtml.Attribute(html, "name", field.Key);
            UiHtml.Attribute(html, "value", field.Value ?? string.Empty);
            html.Append('>');
        }
        foreach (var action in Actions) {
            var cancel = action.Kind == CanopyDialogActionKind.Cancel;
            html.Append("<button");
            UiHtml.Attribute(html, "type", action.Target != null ? "submit" : "button");
            UiHtml.Attribute(html, "class", "cx-btn cx-dialog-action");
            UiHtml.Attribute(html, "data-cx-part", "action");
            if (cancel) UiHtml.Attribute(html, "data-cx-cancel", string.Empty);
            else UiHtml.Attribute(html, "data-cx-action", action.Id);
            UiHtml.Attribute(html, "data-variant", cancel ? null : action.Tone == Tone.Danger ? "danger" : "primary");
            if (action.Tone == Tone.Danger) UiHtml.Attribute(html, "data-danger", string.Empty);
            UiHtml.Attribute(html, "data-tone", action.Tone.WireName());
            if (action.Target != null) {
                UiHtml.Attribute(html, "name", "action");
                UiHtml.Attribute(html, "value", action.Id);
                UiHtml.Attribute(html, "formaction", action.Target);
                UiHtml.Attribute(html, "formmethod", UiHtml.Token(action.Method));
            }
            html.Append('>').Append(UiHtml.Encode(action.Label)).Append("</button>");
        }
        return html.Append("</").Append(tag).Append('>').ToString();
    }
}
