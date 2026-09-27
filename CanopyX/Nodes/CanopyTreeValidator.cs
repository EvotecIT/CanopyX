using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// Walks a set of nodes and their inline children without recursion and checks the rules every tree must follow:
/// unique ids and valid node shapes.
/// </summary>
/// <remarks>
/// The duplicate-id check also catches a node that contains itself, so the recursive JSON writer never runs on a
/// cyclic tree. The runtime keys loaded nodes by id and refers to them by id path, so a duplicate id would make search
/// hits, deep links, and remembered state point at the wrong row.
/// </remarks>
internal static class CanopyTreeValidator {
    internal static void Validate(IEnumerable<CanopyNode> roots, string owner, Action<CanopyNode>? visit = null) {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var pending = new Stack<CanopyNode>();
        var top = new List<CanopyNode>(roots);
        for (var index = top.Count - 1; index >= 0; index--) {
            pending.Push(top[index] ?? throw new InvalidOperationException(owner + " has a null node."));
        }

        while (pending.Count > 0) {
            var node = pending.Pop();
            if (!ids.Add(node.Id)) {
                throw new InvalidOperationException(owner + " has more than one node with id '" + node.Id + "'.");
            }

            node.ValidateShape();
            visit?.Invoke(node);
            var children = node.ChildNodes;
            for (var index = children.Count - 1; index >= 0; index--) {
                pending.Push(children[index] ?? throw new InvalidOperationException("Node '" + node.Id + "' has a null child."));
            }
        }
    }
}
