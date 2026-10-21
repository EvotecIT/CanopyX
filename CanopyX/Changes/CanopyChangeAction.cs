using System;

namespace CanopyX;

/// <summary>
/// An action every item of a change list offers (or the items that name it), or one in the list's bar: a host action (the list
/// raises <c>canopyx:changeAction</c> and the host does the rest, such as acknowledging), a copy action that writes a value to the
/// clipboard, a link that opens a value as an address, or an action that reveals the item's details or diff. A host action can ask
/// for a reason first. CanopyX never acts on an item otherwise.
/// </summary>
public sealed class CanopyChangeAction {
    /// <summary>Creates an action.</summary>
    /// <param name="id">The action's identity, such as <c>acknowledge</c>.</param>
    /// <param name="label">Its label: plain text of at most 64 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="label"/> is null.</exception>
    public CanopyChangeAction(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = label ?? throw new ArgumentNullException(nameof(label));
    }

    /// <summary>Gets the action's identity.</summary>
    public string Id { get; }

    /// <summary>Gets the label.</summary>
    public string Label { get; }

    /// <summary>Gets or sets the icon; with an icon the row shows the icon and the label is its accessible name and tooltip.</summary>
    public CanopyChangeActionIcon Icon { get; set; }

    /// <summary>
    /// Gets or sets what a copy action copies: <c>path</c>, <c>previousPath</c>, or the key of one of the item's
    /// <see cref="CanopyChangeItem.Values"/> (such as <c>unc</c>). Null for a host action. An item without that value does not offer it.
    /// </summary>
    public string? Copy { get; set; }

    /// <summary>
    /// Gets or sets what a link action opens: <c>path</c> or the key of one of the item's values (for a bar action, of the list's
    /// <see cref="CanopyChangeList.Values"/>) holding an address such as <c>#gpo/contoso/1</c> or an <c>https:</c> URL. Addresses
    /// with another scheme are not offered. Null for other actions.
    /// </summary>
    public string? Link { get; set; }

    /// <summary>Gets or sets what the action opens in the list itself: the item's details or its diff. Not for bar actions.</summary>
    public CanopyChangeReveal Reveal { get; set; }

    /// <summary>
    /// Gets or sets whether a host action asks for a reason first: the list shows a field and raises the action with the reason
    /// once the reader confirms, as governed changes such as acknowledging need.
    /// </summary>
    public bool Reason { get; set; }
}