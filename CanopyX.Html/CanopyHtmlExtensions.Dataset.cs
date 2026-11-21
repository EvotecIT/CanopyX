namespace CanopyX.Html;

/// <summary>Writes shared datasets for the views that read them.</summary>
public static partial class CanopyHtmlExtensions {
    /// <summary>
    /// Writes a dataset once for every view on the page that names it (<see cref="CanopyGridSource.FromDataset"/>): a hidden
    /// element the runtime reads when the first view queries, and never mounts. Place it anywhere before or after the views.
    /// </summary>
    /// <param name="dataset">The dataset.</param>
    /// <param name="options">Row format (<see cref="CanopyHtmlOptions.RowData"/>: compact rows above the default threshold, as for a
    /// grid), asset mode, <see cref="CanopyHtmlOptions.Document"/> and nonce. With inline assets the fragment carries the part
    /// that decodes compact rows or reads an address. Other options do not apply.</param>
    /// <returns>The fragment markup.</returns>
    /// <exception cref="System.ArgumentNullException"><paramref name="dataset"/> is null.</exception>
    /// <exception cref="System.InvalidOperationException">The dataset is invalid.</exception>
    public static string ToHtmlFragment(this CanopyDataset dataset, CanopyHtmlOptions? options = null) =>
        CanopyHtmlWriter.Fragment(dataset, options ?? new CanopyHtmlOptions());
}
