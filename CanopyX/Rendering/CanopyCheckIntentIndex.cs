using System.Collections.Generic;

namespace CanopyX.Rendering;

/// <summary>Evaluates initial checking intent for the script-free renderer without materializing lazy children.</summary>
internal sealed class CanopyCheckIntentIndex {
    private sealed class Branch {
        internal bool? Value;
        internal int Mask;
        internal readonly Dictionary<string, Branch> Children = new(System.StringComparer.Ordinal);
    }

    private readonly Branch _root = new();
    private readonly CanopyCheckboxMode _mode;

    internal CanopyCheckIntentIndex(CanopyView view) {
        _mode = view.Checkboxes;
        foreach (var intent in view.CheckIntents) {
            var branch = _root;
            foreach (var id in intent.Path) {
                if (!branch.Children.TryGetValue(id, out var child)) branch.Children.Add(id, child = new Branch());
                branch = child;
            }
            branch.Value = intent.IsChecked;
        }
        var pending = new Stack<(Branch Branch, bool Visited)>();
        pending.Push((_root, false));
        while (pending.Count > 0) {
            var (branch, visited) = pending.Pop();
            if (visited) {
                branch.Mask = branch.Value.HasValue ? branch.Value.Value ? 1 : 2 : 0;
                foreach (var child in branch.Children.Values) branch.Mask |= child.Mask;
            } else {
                pending.Push((branch, true));
                foreach (var child in branch.Children.Values) pending.Push((child, false));
            }
        }
    }

    internal string State(IList<string> path) {
        Branch? branch = _root;
        var value = false;
        foreach (var id in path) {
            if (branch == null || !branch.Children.TryGetValue(id, out branch)) branch = null;
            if (_mode == CanopyCheckboxMode.Hierarchical && branch?.Value != null) value = branch.Value.Value;
        }
        if (_mode == CanopyCheckboxMode.Independent) return branch?.Value == true ? "true" : "false";
        return branch != null && (branch.Mask & (value ? 2 : 1)) != 0 ? "mixed" : value ? "true" : "false";
    }
}
