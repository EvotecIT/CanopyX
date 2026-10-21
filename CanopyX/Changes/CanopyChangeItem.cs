using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// One changed file or item in a change list: what happened (added, removed, modified, renamed), its path, its versions before and
/// after, facts, risk flags with their reasons, an optional text diff the reader can open in place, and the values its actions copy.
/// </summary>
public sealed class CanopyChangeItem {
    /// <summary>Creates an item.</summary>
    /// <param name="id">The item's identity in its list.</param>
    /// <param name="kind">What happened.</param>
    /// <param name="path">Its path, folders separated by <c>/</c> or <c>\</c>; at most 2,048 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="path"/> is null.</exception>
    public CanopyChangeItem(string id, CanopyChangeKind kind, string path) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Kind = kind;
        Path = path ?? throw new ArgumentNullException(nameof(path));
    }

    /// <summary>Gets the item's identity.</summary>
    public string Id { get; }

    /// <summary>Gets or sets what happened.</summary>
    public CanopyChangeKind Kind { get; set; }

    /// <summary>Gets or sets the path; the list groups items by its folder.</summary>
    public string Path { get; set; }

    /// <summary>Gets or sets the earlier path of a renamed or moved item.</summary>
    public string? PreviousPath { get; set; }

    /// <summary>Gets or sets the badge text in place of the kind's own, such as "Owner changed" for a modified item; at most 64 characters.</summary>
    public string? KindLabel { get; set; }

    /// <summary>Gets or sets a short line under the path, such as "Unmanaged file"; at most 200 characters.</summary>
    public string? Secondary { get; set; }

    /// <summary>Gets or sets the version before the change; null for an added item or when unknown.</summary>
    public CanopyChangeVersion? Before { get; set; }

    /// <summary>Gets or sets the version after the change; null for a removed item or when unknown.</summary>
    public CanopyChangeVersion? After { get; set; }

    /// <summary>Gets the facts the details show, at most 32: owner, signer, version and the like.</summary>
    public IList<CanopyChangeFact> Facts { get; } = new List<CanopyChangeFact>();

    /// <summary>Gets the risk flags, at most 16; an item with any is flagged and kept by the "Flagged only" filter.</summary>
    public IList<CanopyChangeFlag> Flags { get; } = new List<CanopyChangeFlag>();

    /// <summary>Gets or sets the item's text diff, which the reader opens in the row; null when there is none.</summary>
    public CanopyTextDiff? Diff { get; set; }

    /// <summary>Gets the ids of the list's actions this item offers; empty offers every action whose value the item has.</summary>
    public IList<string> Actions { get; } = new List<string>();

    /// <summary>Gets values that copy actions copy by key, at most 16, such as a full UNC path under <c>unc</c>.</summary>
    public IDictionary<string, string> Values { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Adds a risk flag and returns the item, for chaining.</summary>
    /// <param name="id">The flag's identity.</param>
    /// <param name="label">The short label.</param>
    /// <param name="reason">Why it is flagged.</param>
    /// <param name="tone">The tone; warning when none is given.</param>
    /// <returns>The item.</returns>
    public CanopyChangeItem Flag(string id, string label, string reason, CanopyTone tone = default) {
        Flags.Add(new CanopyChangeFlag(id, label, reason, tone));
        return this;
    }

    /// <summary>Adds a fact and returns the item, for chaining.</summary>
    /// <param name="label">What the value is.</param>
    /// <param name="before">The value before, or null for a fact with one value.</param>
    /// <param name="after">The value after, or the one value.</param>
    /// <param name="tone">The tone of the value.</param>
    /// <returns>The item.</returns>
    public CanopyChangeItem Fact(string label, string? before, string? after, CanopyTone tone = default) {
        Facts.Add(new CanopyChangeFact(label) { Before = before, After = after, Tone = tone });
        return this;
    }
}
