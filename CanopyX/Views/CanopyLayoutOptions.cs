using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Lets the reader switch a view's layout mode and density from a Layout menu: fit to the width, keep every column and
/// scroll sideways, or show each record as a card (flat grids). Switching keeps the sort, filters, search, selection,
/// focus and the first row in view, and the choice is part of the state saved views keep.
/// </summary>
/// <remarks>Set it on <see cref="CanopyDataGridView.Layout"/> or <see cref="CanopyTreeView.Layout"/>. Print never scrolls: it uses a
/// table for the fit and scroll layouts and stacked records for cards.</remarks>
public sealed class CanopyLayoutOptions {
    /// <summary>Gets or sets the layout the view opens with. It must be one of <see cref="Modes"/>. Defaults to <see cref="CanopyLayoutMode.Fit"/>.</summary>
    public CanopyLayoutMode Mode { get; set; }

    /// <summary>Gets the layouts the reader can choose, in menu order. Empty offers every layout the view supports: all three on a
    /// flat grid, <see cref="CanopyLayoutMode.Fit"/> and <see cref="CanopyLayoutMode.Scroll"/> on a tree.</summary>
    public IList<CanopyLayoutMode> Modes { get; } = new List<CanopyLayoutMode>();

    /// <summary>Gets or sets the density the view opens with. Null keeps the view's own density (a flat grid's
    /// <see cref="CanopyDataGridView.Density"/>, the default on a tree). The reader can change it.</summary>
    public CanopyGridDensity? Density { get; set; }

    internal void Validate(bool tree) {
        var seen = new HashSet<CanopyLayoutMode>();
        foreach (var mode in Modes) {
            if (!Enum.IsDefined(typeof(CanopyLayoutMode), mode) || !seen.Add(mode) || tree && mode == CanopyLayoutMode.Cards)
                throw new InvalidOperationException("Layout modes must be distinct, known and supported by the view; trees offer fit and scroll.");
        }
        if (!Enum.IsDefined(typeof(CanopyLayoutMode), Mode) || tree && Mode == CanopyLayoutMode.Cards || Modes.Count > 0 && !seen.Contains(Mode))
            throw new InvalidOperationException("The starting layout must be one of the layouts the view offers.");
        if (Density.HasValue && !Enum.IsDefined(typeof(CanopyGridDensity), Density.Value))
            throw new ArgumentOutOfRangeException(nameof(Density), Density, "Unknown density.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (Mode != CanopyLayoutMode.Fit || Modes.Count > 0 && !Modes.Contains(CanopyLayoutMode.Fit)) writer.Property("mode", Name(Mode));
        if (Modes.Count > 0) {
            writer.Name("modes").BeginArray();
            foreach (var mode in Modes) writer.String(Name(mode));
            writer.EndArray();
        }
        if (Density.HasValue) writer.Property("density", Density.Value == CanopyGridDensity.Compact ? "compact" : Density.Value == CanopyGridDensity.Comfortable ? "comfortable" : "default");
        writer.EndObject();
    }

    private static string Name(CanopyLayoutMode mode) => mode == CanopyLayoutMode.Scroll ? "scroll" : mode == CanopyLayoutMode.Cards ? "cards" : "fit";
}
