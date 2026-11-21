using System;

namespace CanopyX.Html.Ui;

/// <summary>
/// A typed dialog button: a plain text label, a tone, and either a submit target or a host-handled answer. A dialog renders
/// its actions in place of <see cref="CanopyDialog.FooterHtml"/>, so a confirm-and-submit dialog needs no hand-written markup.
/// </summary>
/// <remarks>
/// Choosing an action raises the cancelable <c>cx-dialog:action</c> event with <c>detail.action</c> set to <see cref="Id"/>.
/// A host that cancels it runs the action itself (for example with <c>fetch</c>) and closes the dialog through the API.
/// Otherwise an action with a <see cref="Target"/> submits the footer form, posting <c>action=<see cref="Id"/></c> and the
/// dialog's <see cref="CanopyDialog.Fields"/>, and an action without one closes the dialog with the reason <c>action</c>.
/// </remarks>
public sealed class CanopyDialogAction {
    private CanopyTone _tone;
    private string? _target;

    /// <summary>Creates an action with an identity, unique within its dialog, and a plain text label.</summary>
    /// <param name="id">The answer the action gives: the <c>cx-dialog:action</c> detail and the submitted <c>action</c> value.</param>
    /// <param name="label">The button text.</param>
    /// <param name="kind">What the action does; <see cref="CanopyDialogActionKind.Submit"/> by default.</param>
    public CanopyDialogAction(string id, string label, CanopyDialogActionKind kind = CanopyDialogActionKind.Submit) {
        Id = UiHtml.Id(id, nameof(id));
        Label = UiHtml.Text(label, nameof(label));
        UiHtml.EnumValue(kind);
        Kind = kind;
    }

    /// <summary>Gets the action's identity within its dialog.</summary>
    public string Id { get; }

    /// <summary>Gets the plain text button label.</summary>
    public string Label { get; }

    /// <summary>Gets what the action does.</summary>
    public CanopyDialogActionKind Kind { get; }

    /// <summary>
    /// Gets or sets the tone. <see cref="CanopyTone.Danger"/> draws a destructive button; <see cref="CanopyTone.None"/> draws a
    /// submit action as the primary button. Every tone is written as <c>data-tone</c> for host themes. Cancel actions have none.
    /// </summary>
    /// <exception cref="InvalidOperationException">The action is a cancel action.</exception>
    public CanopyTone Tone {
        get => _tone;
        set {
            if (Kind == CanopyDialogActionKind.Cancel && value != CanopyTone.None) throw new InvalidOperationException("A cancel action has no tone.");
            _tone = value;
        }
    }

    /// <summary>
    /// Gets or sets the address the action submits to: http, https or relative. Null (the default) leaves the answer to the
    /// host's <c>cx-dialog:action</c> handler, then closes the dialog. Cancel actions never submit.
    /// </summary>
    /// <exception cref="ArgumentException">The address is not an http, https or relative address of at most 2,048 characters.</exception>
    /// <exception cref="InvalidOperationException">The action is a cancel action.</exception>
    public string? Target {
        get => _target;
        set {
            if (Kind == CanopyDialogActionKind.Cancel && value != null) throw new InvalidOperationException("A cancel action does not submit.");
            if (value != null && !IsSafeTarget(value)) throw new ArgumentException("A submit target must be an http, https or relative address of 1 to 2,048 characters without control characters.", nameof(value));
            _target = value;
        }
    }

    /// <summary>Gets or sets the method the action submits with; <see cref="CanopyDialogSubmitMethod.Post"/> by default.</summary>
    public CanopyDialogSubmitMethod Method { get; set; }

    /// <summary>Creates a cancel action.</summary>
    /// <param name="label">The button text, for example <c>Cancel</c>.</param>
    public static CanopyDialogAction Cancel(string label = "Cancel") => new("cancel", label, CanopyDialogActionKind.Cancel);

    /// <summary>Creates a submit action.</summary>
    /// <param name="id">The answer the action gives.</param>
    /// <param name="label">The button text.</param>
    /// <param name="tone">The tone, for example <see cref="CanopyTone.Danger"/> for a destructive action.</param>
    /// <param name="target">The address to submit to, or null to leave the answer to the host.</param>
    public static CanopyDialogAction Submit(string id, string label, CanopyTone tone = default, string? target = null)
        => new(id, label) { Tone = tone, Target = target };

    private static bool IsSafeTarget(string url) {
        if (url.Trim().Length == 0 || url.Length > 2048) return false;
        foreach (var character in url) if (char.IsControl(character)) return false;
        var trimmed = url.Trim();
        if (trimmed.StartsWith("//", StringComparison.Ordinal) || trimmed.IndexOf('\\') >= 0) return false;
        var colon = trimmed.IndexOf(':');
        var slash = trimmed.IndexOfAny(new[] { '/', '?', '#' });
        if (colon < 0 || slash >= 0 && slash < colon) return true;
        var scheme = trimmed.Substring(0, colon);
        return scheme.Equals("http", StringComparison.OrdinalIgnoreCase) || scheme.Equals("https", StringComparison.OrdinalIgnoreCase);
    }
}
