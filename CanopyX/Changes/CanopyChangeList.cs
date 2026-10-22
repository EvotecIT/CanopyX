using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// A list of changed files or items (docs/changes.md): Added, Removed, Modified and Renamed badges, grouped by folder, with sizes and
/// hashes before and after (short hashes that copy whole), risk flags with their reasons and a "Flagged only" filter, details and text
/// diffs that open in the row, and per-item actions the host provides.
/// </summary>
/// <remarks>
/// CanopyX never acts on an item: a host action raises <c>canopyx:changeAction</c>; a copy action writes a value to the clipboard.
/// The document is checked when it is written (<see cref="Validate"/>, <see cref="ToJson"/> and the writers); <see cref="FromJson"/>
/// reads one back.
/// </remarks>
public sealed partial class CanopyChangeList {
    /// <summary>The most items a list holds.</summary>
    public const int MaxItems = 10000;

    /// <summary>Creates a list.</summary>
    /// <param name="id">The list's identity; a nonempty identifier of at most 256 characters.</param>
    /// <param name="label">Its accessible name, such as "File changes": plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty.</exception>
    public CanopyChangeList(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = label;
    }

    /// <summary>Gets the list's identity.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the accessible name.</summary>
    public string Label { get; set; }

    /// <summary>Gets the items, in the order the host gives them within each folder.</summary>
    public IList<CanopyChangeItem> Items { get; } = new List<CanopyChangeItem>();

    /// <summary>Gets the actions items offer, at most 8, in the order they show.</summary>
    public IList<CanopyChangeAction> Actions { get; } = new List<CanopyChangeAction>();

    /// <summary>Gets the actions of the list's bar, at most 8: host actions, and copy and link actions on <see cref="Values"/>.</summary>
    public IList<CanopyChangeAction> Toolbar { get; } = new List<CanopyChangeAction>();

    /// <summary>Gets values the bar's copy and link actions use by key, at most 16, such as the address of the object that changed.</summary>
    public IDictionary<string, string> Values { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets or sets the files the bar offers to download: the items the filters keep, as CSV or JSON. None by default.</summary>
    public CanopyChangeExports Exports { get; set; }

    /// <summary>Gets or sets whether items are grouped under their folders (default) or listed with their whole paths.</summary>
    public bool GroupByFolder { get; set; } = true;

    /// <summary>Gets or sets whether the list opens showing only flagged items.</summary>
    public bool FlaggedOnly { get; set; }

    /// <summary>Gets or sets whether flagged items open with their details shown.</summary>
    public bool ExpandFlagged { get; set; }

    /// <summary>Gets or sets how many characters of a hash show, 4 to 64; the whole hash is the tooltip and what Copy writes. Default 8.</summary>
    public int HashLength { get; set; } = 8;

    /// <summary>Gets or sets how many items show before "Show more", 10 to 1,000. Default 200.</summary>
    public int PageSize { get; set; } = 200;

    /// <summary>Gets or sets the time zone of the versions' times; UTC by default.</summary>
    public CanopyTimeZone TimeZone { get; set; }

    /// <summary>Gets or sets the translations of the texts the list writes itself; the document carries those that differ from English.</summary>
    public CanopyLabels? Labels { get; set; }

    /// <summary>Adds an item and returns it, for its versions, facts, flags and diff.</summary>
    /// <param name="id">The item's identity in the list.</param>
    /// <param name="kind">What happened.</param>
    /// <param name="path">Its path.</param>
    /// <returns>The item.</returns>
    public CanopyChangeItem Add(string id, CanopyChangeKind kind, string path) {
        var item = new CanopyChangeItem(id, kind, path);
        Items.Add(item);
        return item;
    }

    /// <summary>Adds an action and returns the list, for chaining.</summary>
    /// <param name="id">The action's identity.</param>
    /// <param name="label">Its label.</param>
    /// <param name="icon">Its icon.</param>
    /// <param name="copy">What a copy action copies (<c>path</c>, <c>previousPath</c> or a value key); null for a host action.</param>
    /// <returns>The list.</returns>
    public CanopyChangeList Action(string id, string label, CanopyChangeActionIcon icon = CanopyChangeActionIcon.None, string? copy = null) {
        Actions.Add(new CanopyChangeAction(id, label) { Icon = icon, Copy = copy });
        return this;
    }

    /// <summary>Adds an action to the list's bar and returns the list, for chaining.</summary>
    /// <param name="action">The action: a host action, or a copy or link action on the list's <see cref="Values"/>.</param>
    /// <returns>The list.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="action"/> is null.</exception>
    public CanopyChangeList Tool(CanopyChangeAction action) {
        Toolbar.Add(action ?? throw new ArgumentNullException(nameof(action)));
        return this;
    }

    /// <summary>Checks the list as the writers do.</summary>
    /// <exception cref="InvalidOperationException">The list is not valid; the message names the first problem.</exception>
    public void Validate() => CanopyChangeValidator.Validate(this);
}
