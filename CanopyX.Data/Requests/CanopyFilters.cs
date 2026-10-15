using System;
using System.Collections.Generic;
using System.Linq;

namespace CanopyX.Data;

/// <summary>Operations on validated filter expressions.</summary>
public static class CanopyFilters {
    /// <summary>Replaces every condition on one column by true and simplifies the result, as a value list without its own filter does.</summary>
    /// <param name="filter">The expression, or null.</param>
    /// <param name="columnId">The column whose conditions are dropped.</param>
    /// <returns>The projected expression, or null when every record matches.</returns>
    /// <remarks>An OR group containing such a condition becomes true: dropping just that term would narrow the expression.</remarks>
    public static CanopyFilterNode? WithoutColumn(CanopyFilterNode? filter, string columnId) {
        if (columnId == null) throw new ArgumentNullException(nameof(columnId));
        if (filter == null) return null;
        var projected = Project(filter, columnId);
        return projected is CanopyFilterConstant constant && constant.Value ? null : projected;
    }

    /// <summary>Combines expressions with AND, ignoring null entries.</summary>
    /// <param name="filters">The expressions.</param>
    /// <returns>The combined expression, or null when none is given.</returns>
    public static CanopyFilterNode? All(params CanopyFilterNode?[] filters) {
        var children = new List<CanopyFilterNode>();
        foreach (var filter in filters ?? throw new ArgumentNullException(nameof(filters))) if (filter != null) children.Add(filter);
        return children.Count == 0 ? null : children.Count == 1 ? children[0] : new CanopyFilterGroup(CanopyGridFilterJunction.All, children);
    }

    private static CanopyFilterNode Project(CanopyFilterNode node, string columnId) {
        switch (node) {
            case CanopyFilterCondition condition:
                return condition.Column.Id == columnId ? CanopyFilterConstant.True : condition;
            case CanopyFilterGroup group:
                var children = new List<CanopyFilterNode>();
                foreach (var child in group.Children) {
                    var projected = Project(child, columnId);
                    if (projected is CanopyFilterConstant constant) {
                        if (constant.Value == (group.Junction == CanopyGridFilterJunction.Any)) return constant;
                        continue;
                    }
                    children.Add(projected);
                }
                if (children.Count == 0) return group.Junction == CanopyGridFilterJunction.All ? CanopyFilterConstant.True : CanopyFilterConstant.False;
                if (children.Count == group.Children.Count && children.Select((child, i) => ReferenceEquals(child, group.Children[i])).All(same => same)) return group;
                return children.Count == 1 ? children[0] : new CanopyFilterGroup(group.Junction, children);
            default:
                return node;
        }
    }
}
