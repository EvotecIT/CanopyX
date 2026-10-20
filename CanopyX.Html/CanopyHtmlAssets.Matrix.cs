using System;
using System.Collections.Generic;
using System.Linq;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>Gets the entry point that renders a matrix: the data-grid entry point, which loads the matrix part on first use.</summary>
    /// <param name="matrix">The matrix.</param>
    /// <returns><see cref="CanopyRuntime.DataGrid"/>. The reporting entry point renders matrices too.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="matrix"/> is null.</exception>
    public static CanopyRuntime GetRuntime(CanopyMatrix matrix) {
        if (matrix == null) throw new ArgumentNullException(nameof(matrix));
        return CanopyRuntime.DataGrid;
    }

    /// <summary>Gets the parts a matrix loads, whose payloads a single-file page carries: the matrix part.</summary>
    /// <param name="matrix">The matrix.</param>
    /// <returns>The parts, in manifest order.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="matrix"/> is null.</exception>
    public static IReadOnlyList<CanopyHtmlPart> GetRequiredParts(CanopyMatrix matrix) {
        if (matrix == null) throw new ArgumentNullException(nameof(matrix));
        return WithRequired(Parts.Where(part => part.IsNeededBy(matrix)));
    }
}