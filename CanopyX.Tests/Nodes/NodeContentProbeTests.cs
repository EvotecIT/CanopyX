namespace CanopyX.Tests.Nodes;

/// <summary>
/// A host that walks a large tree (to build an index, to count, to export) asks a node what it holds before it reads
/// a collection, because reading a collection creates it.
/// </summary>
public sealed class NodeContentProbeTests {
    [Fact]
    public void ProbesSayWhatANodeHoldsAndFollowRemovals() {
        var node = new CanopyNode("n", "Node");
        Assert.False(node.HasInlineChildren || node.HasCells || node.HasBadges || node.HasFlags || node.HasData);

        node.Children.Add(new CanopyNode("c", "Child"));
        node.Cells["size"] = 1;
        node.Badges.Add(new CanopyBadge("new"));
        node.Flags.Add("changed");
        node.Data["key"] = "value";
        Assert.True(node.HasInlineChildren && node.HasCells && node.HasBadges && node.HasFlags && node.HasData);

        node.Children.Clear();
        node.Cells.Clear();
        node.Badges.Clear();
        node.Flags.Clear();
        node.Data.Remove("key");
        Assert.False(node.HasInlineChildren || node.HasCells || node.HasBadges || node.HasFlags || node.HasData);

        var cell = new CanopyCell("text");
        Assert.False(cell.HasBadges);
        cell.Badges.Add(new CanopyBadge("new"));
        Assert.True(cell.HasBadges);
    }

    [Fact]
    public void ProbingALeafAllocatesNothing() {
        var nodes = new CanopyNode[10_000];
        var cell = new CanopyCell("text");
        for (var index = 0; index < nodes.Length; index++) {
            nodes[index] = new CanopyNode("n" + index, "Node");
        }

        // Once before measuring, so nothing the first call sets up is counted.
        var held = Probe(nodes[0], cell);
        var before = GC.GetAllocatedBytesForCurrentThread();
        foreach (var node in nodes) {
            held |= Probe(node, cell);
        }

        var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        Assert.False(held);
        // One empty list per node would be some hundred kilobytes; the probes create none.
        Assert.True(allocated < 4096, "Probing 10,000 leaves allocated " + allocated + " bytes.");
    }

    private static bool Probe(CanopyNode node, CanopyCell cell) =>
        node.HasInlineChildren || node.HasCells || node.HasBadges || node.HasFlags || node.HasData || cell.HasBadges;
}
