using System;

namespace CanopyX;

/// <summary>
/// A state a matrix cell can hold: its label (in the legend, the tooltip and the accessible name), tone and symbol. List a
/// matrix's states worst first: a collapsed group shows the worst state of its cells.
/// </summary>
public sealed class CanopyMatrixState {
    /// <summary>Creates a state.</summary>
    /// <param name="id">The id cells name it by: 1 to 64 letters, digits, hyphens and underscores, starting with a letter.</param>
    /// <param name="label">The label: plain text of at most 200 characters.</param>
    /// <param name="tone">The tone of the cell and its symbol.</param>
    /// <param name="symbol">The symbol, so the state never relies on colour alone.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is not a valid id.</exception>
    public CanopyMatrixState(string id, string label, CanopyTone tone, CanopyMatrixSymbol symbol) {
        Id = CanopyFlowValues.RequireIdentifier(id, nameof(id), "A state id");
        Label = label;
        Tone = tone;
        Symbol = symbol;
    }

    /// <summary>Gets the state's id.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the label. Plain text of at most 200 characters.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets the tone.</summary>
    public CanopyTone Tone { get; set; }

    /// <summary>Gets or sets the symbol.</summary>
    public CanopyMatrixSymbol Symbol { get; set; }

    /// <summary>
    /// Gets or sets whether cells in this state need attention: they count in the totals (unless
    /// <see cref="CanopyMatrix.TotalStates"/> names others) and keep their row and column when the reader shows only problems.
    /// </summary>
    public bool Attention { get; set; }
}
