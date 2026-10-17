using Xunit;

namespace CanopyX.Tests.Protocol;

public sealed class TextFoldingTests {
    [Fact]
    public void Fold_UsesTheProtocolsFrozenSingleUnitRules() {
        Assert.Equal("école zürich ωμέγα привет", CanopyTextFolding.Fold("ÉCOLE ZÜRICH ΩΜΈΓΑ ПРИВЕТ"));
        // Expanding mappings are not applied: U+0130 stays, and dotless i stays distinct from i.
        Assert.Equal("İıi", CanopyTextFolding.Fold("İıI"));
        Assert.Null(CanopyTextFolding.Fold(null));
        const string folded = "already folded";
        Assert.Same(folded, CanopyTextFolding.Fold(folded));
        Assert.Equal('a', CanopyTextFolding.Fold('A'));
    }
}
