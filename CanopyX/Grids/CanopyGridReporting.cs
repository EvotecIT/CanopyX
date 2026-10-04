using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Optional reporting capabilities carried by the reporting-grid runtime.</summary>
/// <remarks>Ordinary flat grids and trees do not include these optional presentation and query policies.</remarks>
public sealed class CanopyGridReporting {
    /// <summary>Gets or sets whether each visible header offers a filter-editor button.</summary>
    /// <remarks>The editor queries all records; the button does not filter only the mounted rows.</remarks>
    public bool HeaderFilters { get; set; }

    /// <summary>Gets or sets whether headers offer pointer dragging and keyboard column move controls.</summary>
    public bool ColumnReorder { get; set; }

    /// <summary>Gets or sets whether low-priority columns are temporarily hidden to fit the viewport.</summary>
    /// <remarks>Hidden fields retain their full query and explicit export semantics and are available to host details.</remarks>
    public bool Responsive { get; set; }

    /// <summary>Gets or sets the minimum center width left by effective pinned groups, from 40 to 4096 CSS pixels.</summary>
    public int MinimumCenterWidth { get; set; } = 128;

    /// <summary>Gets immutable width, flex, pin and responsive retention policies keyed by declared column identities.</summary>
    public IDictionary<string, CanopyGridColumnLayout> Layout { get; } = new Dictionary<string, CanopyGridColumnLayout>(StringComparer.Ordinal);

    /// <summary>Gets immutable text ordering policies keyed by declared sortable text-column identities.</summary>
    public IDictionary<string, CanopyGridOrdering> Ordering { get; } = new Dictionary<string, CanopyGridOrdering>(StringComparer.Ordinal);

    /// <summary>Gets immutable safe presenters keyed by declared column identities.</summary>
    public IDictionary<string, CanopyGridPresenter> Presenters { get; } = new Dictionary<string, CanopyGridPresenter>(StringComparer.Ordinal);

    internal void Validate(IList<CanopyColumn> columns) {
        if (MinimumCenterWidth < 40 || MinimumCenterWidth > 4096)
            throw new InvalidOperationException("MinimumCenterWidth must be from 40 to 4096 CSS pixels.");
        foreach (var pair in Layout) {
            CanopyColumn? declared = null;
            foreach (var column in columns) if (column.Id == pair.Key) declared = column;
            if (declared == null || pair.Value == null || declared.Width < pair.Value.Minimum || declared.Width > pair.Value.Maximum)
                throw new InvalidOperationException("A layout needs a declared column whose initial width is within its non-null policy bounds.");
        }
        foreach (var pair in Ordering) {
            CanopyColumn? declared = null;
            foreach (var column in columns) if (column.Id == pair.Key) declared = column;
            if (declared == null || declared.Kind != CanopyColumnKind.Text || !declared.Sortable || pair.Value == null)
                throw new InvalidOperationException("Reporting ordering must identify a sortable text column and a non-null policy.");
        }
        foreach (var pair in Presenters) {
            CanopyColumn? declared = null;
            foreach (var column in columns) if (column.Id == pair.Key) declared = column;
            if (declared == null || pair.Value == null) throw new InvalidOperationException("A presenter needs a declared column and a non-null descriptor.");
            var presenter = pair.Value;
            if (presenter.Kind == CanopyGridPresenterKind.Progress && declared.Kind != CanopyColumnKind.Number ||
                (presenter.Kind == CanopyGridPresenterKind.Boolean || presenter.Kind == CanopyGridPresenterKind.List || presenter.Kind == CanopyGridPresenterKind.Link) && declared.Kind != CanopyColumnKind.Text)
                throw new InvalidOperationException("The presenter is incompatible with the column's raw value kind.");
            if (presenter.HrefColumn != null) {
                CanopyColumn? href = null;
                foreach (var column in columns) if (column.Id == presenter.HrefColumn) href = column;
                if (href == null || href.Kind != CanopyColumnKind.Text) throw new InvalidOperationException("A link destination needs a declared text column.");
            }
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (HeaderFilters) writer.Property("headerFilters", true);
        if (ColumnReorder) writer.Property("columnReorder", true);
        if (Responsive) writer.Property("responsive", true);
        if (MinimumCenterWidth != 128) writer.Property("minimumCenterWidth", MinimumCenterWidth);
        if (Layout.Count != 0) {
            writer.Name("layout").BeginObject();
            foreach (var pair in Layout) { writer.Name(pair.Key); pair.Value.WriteJson(writer); }
            writer.EndObject();
        }
        if (Ordering.Count != 0) {
            writer.Name("ordering").BeginObject();
            foreach (var pair in Ordering) { writer.Name(pair.Key); pair.Value.WriteJson(writer); }
            writer.EndObject();
        }
        if (Presenters.Count != 0) {
            writer.Name("presenters").BeginObject();
            foreach (var pair in Presenters) { writer.Name(pair.Key); pair.Value.WriteJson(writer); }
            writer.EndObject();
        }
        writer.EndObject();
    }
}
