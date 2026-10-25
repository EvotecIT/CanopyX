using System;
using System.Collections.Generic;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyColumn {
    private bool? _sortable, _filterable, _hidden;
    private string? _className, _alignment, _sortComparator;
    private bool _classNameSet, _alignmentSet, _sortComparatorSet;
    private DefaultList _orderData = new DefaultList(), _orderSequence = new DefaultList();
    internal CanopyGridColumnDefaults? Defaults { get; set; }
    internal bool HasDefaultRules { get; private set; }
    internal string? DeclaredClassName => _className;

    /// <summary>Gets or sets space-separated safe CSS class tokens for this column's header and cells.</summary>
    public string? ClassName {
        get => _classNameSet ? _className : Defaults?.ClassName;
        set { ValidateClassName(value); _className = value; _classNameSet = true; }
    }
    /// <summary>Gets or sets logical text alignment: start, center or end; null follows the column kind.</summary>
    public string? Alignment {
        get => _alignmentSet ? _alignment : Defaults?.Alignment;
        set { ValidateAlignment(value); _alignment = value; _alignmentSet = true; }
    }
    /// <summary>Gets or sets the raw sort column identities substituted for this column. Empty uses this column.</summary>
    public IList<string> OrderData {
        get => _orderData;
        set => _orderData = new DefaultList(value ?? throw new ArgumentNullException(nameof(value)));
    }
    /// <summary>Gets or sets the header's direction cycle using asc, desc and none. Empty uses the built-in cycle.</summary>
    public IList<string> OrderSequence {
        get => _orderSequence;
        set => _orderSequence = new DefaultList(value ?? throw new ArgumentNullException(nameof(value)));
    }
    /// <summary>Gets or sets the named browser or host sort comparator; no executable code is serialized.</summary>
    public string? SortComparator {
        get => _sortComparatorSet ? _sortComparator : Defaults?.SortComparator;
        set {
            if (value != null && !System.Text.RegularExpressions.Regex.IsMatch(value, "^[a-z][a-zA-Z0-9]{0,31}$")) throw new ArgumentException("A comparator name must be a lowercase letter followed by up to 31 ASCII letters and digits.", nameof(value));
            _sortComparator = value; _sortComparatorSet = true;
        }
    }

    internal void ApplyDefaults(CanopyGridColumnDefaults defaults, bool hasRules) {
        Defaults = defaults; HasDefaultRules = hasRules;
        _orderData.Apply(defaults.OrderData); _orderSequence.Apply(defaults.OrderSequence);
    }

    private sealed class DefaultList : System.Collections.ObjectModel.Collection<string> {
        private bool _declared;
        internal bool Declared => _declared;
        internal DefaultList() { }
        internal DefaultList(IEnumerable<string> values) { foreach (var value in values) Items.Add(value); _declared = true; }
        internal void Apply(IEnumerable<string>? values) {
            if (_declared) return;
            Items.Clear(); if (values != null) foreach (var value in values) Items.Add(value);
        }
        protected override void InsertItem(int index, string item) { _declared = true; base.InsertItem(index, item); }
        protected override void SetItem(int index, string item) { _declared = true; base.SetItem(index, item); }
        protected override void ClearItems() { _declared = true; base.ClearItems(); }
        protected override void RemoveItem(int index) { _declared = true; base.RemoveItem(index); }
    }

    internal static void ValidateClassName(string? value) {
        if (value == null) return;
        if (value.Length > 512 || !System.Text.RegularExpressions.Regex.IsMatch(value, "\\A[A-Za-z_][A-Za-z0-9_-]*(?: +[A-Za-z_][A-Za-z0-9_-]*)*\\z"))
            throw new ArgumentException("Column classes must be space-separated ASCII CSS tokens starting with a letter or underscore.", nameof(value));
    }
    internal static void ValidateAlignment(string? value) {
        if (value != null && value != "start" && value != "center" && value != "end") throw new ArgumentException("Alignment is start, center or end.", nameof(value));
    }
    internal void ValidateGridDefaults(IList<CanopyColumn> columns) {
        ValidateClassName(ClassName); ValidateAlignment(Alignment);
        var data = new HashSet<string>(StringComparer.Ordinal);
        if (OrderData.Count > 32) throw new InvalidOperationException("OrderData supports at most 32 columns.");
        foreach (var id in OrderData) if (id == null || !columns.Any(column => column.Id == id) || !data.Add(id))
            throw new InvalidOperationException("OrderData requires unique declared column identities.");
        if (OrderSequence.Count > 3 || OrderSequence.Distinct(StringComparer.Ordinal).Count() != OrderSequence.Count ||
            OrderSequence.Any(item => item != "asc" && item != "desc" && item != "none")) throw new InvalidOperationException("OrderSequence contains unique asc, desc or none values.");
    }
    internal void WriteGridDefaultsJson(CanopyJsonWriter writer) {
        // Class selectors must see authored classes, never classes introduced by another rule.
        if (_classNameSet) { writer.Name("className"); if (_className == null) writer.Null(); else writer.String(_className); }
        if (_alignmentSet && _alignment == null) writer.Name("alignment").Null(); else writer.OptionalProperty("alignment", Alignment);
        if (_sortComparatorSet && _sortComparator == null) writer.Name("sortComparator").Null(); else writer.OptionalProperty("sortComparator", SortComparator);
        if (OrderData.Count > 0 || _orderData.Declared) { writer.Name("orderData").BeginArray(); foreach (var id in OrderData) writer.String(id); writer.EndArray(); }
        if (OrderSequence.Count > 0 || _orderSequence.Declared) { writer.Name("orderSequence").BeginArray(); foreach (var direction in OrderSequence) writer.String(direction); writer.EndArray(); }
    }
}
