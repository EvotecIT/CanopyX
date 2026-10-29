using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Explicit ordered chains over an inline grid's existing records.</summary>
/// <remarks>CanopyX does not discover routes, infer cycles, or compute domain relationships. The host supplies
/// each chain, step label and annotation. Limits are 200 chains, 256 steps per chain and 10,000 steps in total.</remarks>
public sealed class CanopyPath {
    private string? _titleColumn;

    /// <summary>Creates an empty path definition. Add chains in source-to-target display order.</summary>
    public CanopyPath() { }

    /// <summary>Gets or sets the record title column. Null uses the row header, then the first visible column.</summary>
    public string? TitleColumn {
        get => _titleColumn;
        set { if (value != null) RequireText(value, nameof(value)); _titleColumn = value; }
    }

    /// <summary>Gets up to 200 chains in display order. An empty collection shows the empty state.</summary>
    public IList<CanopyPathChain> Chains { get; } = new List<CanopyPathChain>();

    internal static void RequireText(string? value, string parameter, int maximum = int.MaxValue) {
        CanopyIdentifiers.Require(value, parameter);
        if (string.IsNullOrWhiteSpace(value) || value!.Length > maximum)
            throw new ArgumentException("Path text must be nonblank and fit its documented bounds.", parameter);
        foreach (var character in value) if (char.IsControl(character))
            throw new ArgumentException("Path text cannot contain control characters.", parameter);
    }

    internal static string FlagName(CanopyPathFlag flag) {
        switch (flag) {
            case CanopyPathFlag.Cycle: return "cycle";
            case CanopyPathFlag.Foreign: return "foreign";
            case CanopyPathFlag.Disabled: return "disabled";
            default: throw new InvalidOperationException("Unknown path annotation.");
        }
    }

    internal void Validate(CanopyDataGridView view) {
        if (view.Source.Kind != CanopyGridSourceKind.Inline || view.RowIdentity != CanopyGridRowIdentity.StableKey)
            throw new InvalidOperationException("A path requires inline records with stable identities.");
        if (TitleColumn != null) {
            var known = false;
            foreach (var column in view.Columns) if (column != null && column.Id == TitleColumn) known = true;
            if (!known) throw new InvalidOperationException("Path titleColumn refers to an undeclared column.");
        }
        if (Chains.Count > 200) throw new InvalidOperationException("A path has at most 200 chains.");
        var records = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in view.Rows) {
            if (row == null || !records.Add(row.Id)) throw new InvalidOperationException("Path records require distinct stable identities.");
        }
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var total = 0;
        foreach (var chain in Chains) {
            if (chain == null || !ids.Add(chain.Id)) throw new InvalidOperationException("Path chains require distinct identities and cannot be null.");
            if (chain.Hops.Count < 1 || chain.Hops.Count > 256) throw new InvalidOperationException("Each path chain has one to 256 steps.");
            total += chain.Hops.Count;
            if (total > 10000) throw new InvalidOperationException("A path has at most 10,000 steps in total.");
            foreach (var hop in chain.Hops) {
                if (hop == null || !records.Contains(hop.Record)) throw new InvalidOperationException("Every path step must refer to an existing grid record.");
                var flags = new HashSet<CanopyPathFlag>();
                foreach (var flag in hop.Flags) {
                    FlagName(flag);
                    if (!flags.Add(flag)) throw new InvalidOperationException("Path step annotations must be distinct.");
                }
                if (hop.Badges.Count > 16) throw new InvalidOperationException("A path step has at most 16 badges.");
                foreach (var badge in hop.Badges) {
                    if (badge == null) throw new InvalidOperationException("A path badge cannot be null.");
                    RequireText(badge.Text, nameof(badge.Text), 256);
                    if (badge.Title != null) RequireText(badge.Title, nameof(badge.Title), 4096);
                    badge.WriteJson(CanopyJsonWriter.Discarding());
                }
            }
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().OptionalProperty("titleColumn", TitleColumn).Name("chains").BeginArray();
        foreach (var chain in Chains) chain.WriteJson(writer);
        writer.EndArray().EndObject();
    }
}
