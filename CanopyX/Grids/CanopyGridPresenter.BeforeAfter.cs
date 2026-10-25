namespace CanopyX;

public sealed partial class CanopyGridPresenter {
    /// <summary>Gets whether the change presenter displays structured before/after values instead of a numeric delta.</summary>
    public bool BeforeAfterValues { get; private set; }

    /// <summary>Creates a change presenter for text, boolean, number or date cells carrying <see cref="CanopyCell.Changes"/>.</summary>
    /// <returns>An immutable change descriptor with <c>beforeAfter:true</c>, without a delta-column dependency.</returns>
    /// <remarks>Raw later-version values still drive queries and exports. A cell without changes uses its ordinary display value.</remarks>
    public static CanopyGridPresenter BeforeAfter() => new CanopyGridPresenter(CanopyGridPresenterKind.Change) { BeforeAfterValues = true };
}
