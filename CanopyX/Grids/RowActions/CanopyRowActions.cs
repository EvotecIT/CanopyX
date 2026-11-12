using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The actions column of a flat grid: buttons at the end of each row, a More menu for the rest, and a lock on rows the host
/// marks read-only. The browser raises host proposals; the static renderer and exports leave the column out (docs/row-actions.md).
/// </summary>
public sealed class CanopyRowActions {
    private string? _label;
    private string? _lockedLabel;
    private int _inline = 2;

    /// <summary>Gets the actions in their order, at most 16. The column is written only when it has one.</summary>
    public IList<CanopyRowAction> Actions { get; } = new List<CanopyRowAction>();

    /// <summary>Gets or sets the column's header and the button group's name; null uses the Actions label.</summary>
    public string? Label {
        get => _label;
        set => _label = value == null ? null : Text(value, 200, nameof(value));
    }

    /// <summary>Gets or sets how many actions show as buttons, 0 to 4; the rest go into the More menu. Default 2.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 0 to 4.</exception>
    public int Inline {
        get => _inline;
        set => _inline = value >= 0 && value <= 4 ? value : throw new ArgumentOutOfRangeException(nameof(value), value, "Row actions show 0 to 4 actions inline.");
    }

    /// <summary>Gets or sets when the buttons show.</summary>
    public CanopyRowActionReveal Reveal { get; set; }

    /// <summary>Gets or sets whether the column stays pinned to the end edge while the grid scrolls sideways. Default true.</summary>
    public bool Pinned { get; set; } = true;

    /// <summary>Gets or sets the rows that show a lock and no actions; null locks none.</summary>
    public CanopyFormatCondition? LockedWhen { get; set; }

    /// <summary>Gets or sets the lock's accessible name and tooltip; null uses the Read-only label.</summary>
    public string? LockedLabel {
        get => _lockedLabel;
        set => _lockedLabel = value == null ? null : Text(value, 500, nameof(value));
    }

    /// <summary>Adds an action.</summary>
    /// <param name="action">The action.</param>
    /// <returns>This column, for chaining.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="action"/> is null.</exception>
    public CanopyRowActions Add(CanopyRowAction action) {
        Actions.Add(action ?? throw new ArgumentNullException(nameof(action)));
        return this;
    }

    /// <summary>The id of the column the browser adds for the actions; no declared column can use it.</summary>
    public const string ColumnId = "cx-row-actions";

    internal bool IsEmpty => Actions.Count == 0;

    private static string Text(string value, int max, string name) {
        if (string.IsNullOrWhiteSpace(value) || value.Length > max) throw new ArgumentException("Row action text needs visible text of at most " + max + " characters.", name);
        return value;
    }

    internal static void ValidateCondition(CanopyFormatCondition? condition, IDictionary<string, CanopyColumn> columns) {
        if (condition == null) return;
        int predicates = 0, groups = 0;
        condition.Validate(columns, 1, ref predicates, ref groups);
    }

    internal void Validate(IList<CanopyColumn> declared) {
        if (Actions.Count > 16) throw new InvalidOperationException("A grid has at most 16 row actions.");
        if (!Enum.IsDefined(typeof(CanopyRowActionReveal), Reveal)) throw new ArgumentOutOfRangeException(nameof(Reveal), Reveal, "Unknown row action reveal.");
        var columns = new Dictionary<string, CanopyColumn>(StringComparer.Ordinal);
        foreach (var column in declared) columns[column.Id] = column;
        if (columns.ContainsKey(ColumnId)) throw new InvalidOperationException("The column id '" + ColumnId + "' belongs to the grid's actions column.");
        ValidateCondition(LockedWhen, columns);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var action in Actions) {
            if (action == null || !ids.Add(action.Id)) throw new InvalidOperationException("Row actions need unique identifiers and cannot be null.");
            action.Validate(columns);
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().OptionalProperty("label", Label);
        if (Inline != 2) writer.Property("inline", Inline);
        if (Reveal == CanopyRowActionReveal.Hover) writer.Property("reveal", "hover");
        if (!Pinned) writer.Property("pin", "none");
        if (LockedWhen != null) { writer.Name("lockedWhen"); LockedWhen.WriteJson(writer); }
        writer.OptionalProperty("lockedLabel", LockedLabel).Name("actions").BeginArray();
        foreach (var action in Actions) action.WriteJson(writer);
        writer.EndArray().EndObject();
    }
}
