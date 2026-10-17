using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>One facet of a <see cref="CanopyFacetPanel"/>: a column shown as a value list with counts or as a range with a histogram.</summary>
public sealed class CanopyFacet {
    private string? _label;
    private int? _limit;
    private int? _bins;
    private CanopyFacetSort? _sort;

    /// <summary>Creates a facet for a column.</summary>
    /// <param name="column">The column id.</param>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public CanopyFacet(string column) {
        CanopyIdentifiers.Require(column, nameof(column));
        Column = column;
    }

    /// <summary>Gets the column id.</summary>
    public string Column { get; }

    /// <summary>Gets or sets the kind; <see cref="CanopyFacetKind.Auto"/> (the default) shows text as a value list and numbers and dates as a range.</summary>
    public CanopyFacetKind Kind { get; set; }

    /// <summary>Gets or sets the facet's heading; null uses the column's title.</summary>
    /// <exception cref="ArgumentException">The value is blank or longer than 256 characters.</exception>
    public string? Label {
        get => _label;
        set => _label = value != null && (value.Trim().Length == 0 || value.Length > 256) ? throw new ArgumentException("A facet label needs 1 to 256 visible characters.", nameof(value)) : value;
    }

    /// <summary>Gets or sets how many values a value list shows before "Show N more", 1 to 200; null keeps 8.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 1 to 200.</exception>
    public int? Limit {
        get => _limit;
        set => _limit = value < 1 || value > 200 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A value list shows 1 to 200 values first.") : value;
    }

    /// <summary>Gets or sets how many bars a range's histogram has, 2 to 60; null keeps 16.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 2 to 60.</exception>
    public int? Bins {
        get => _bins;
        set => _bins = value < 2 || value > 60 ? throw new ArgumentOutOfRangeException(nameof(value), value, "A histogram has 2 to 60 bars.") : value;
    }

    /// <summary>Gets or sets an explicit value-list order. If unassigned, the list follows the column's declared order, or counts when no order is declared.</summary>
    /// <remarks>The getter returns <see cref="CanopyFacetSort.Count"/> when unassigned. Assigning it explicitly requests the most frequent values first even for an ordered column.</remarks>
    public CanopyFacetSort Sort {
        get => _sort ?? CanopyFacetSort.Count;
        set => _sort = value;
    }

    /// <summary>Gets or sets whether the facet starts collapsed to its heading.</summary>
    public bool Collapsed { get; set; }

    internal void Validate(CanopyColumn column) {
        if (!Enum.IsDefined(typeof(CanopyFacetKind), Kind)) throw new ArgumentOutOfRangeException(nameof(Kind), Kind, "Unknown facet kind.");
        if (!Enum.IsDefined(typeof(CanopyFacetSort), Sort)) throw new ArgumentOutOfRangeException(nameof(Sort), Sort, "Unknown facet order.");
        if (Kind == CanopyFacetKind.Range && column.Kind == CanopyColumnKind.Text) throw new InvalidOperationException("Range facet '" + Column + "' needs a number or date column.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        if (Kind == CanopyFacetKind.Auto && _label == null && !_limit.HasValue && !_bins.HasValue && !_sort.HasValue && !Collapsed) { writer.String(Column); return; }
        writer.BeginObject().Property("column", Column);
        if (Kind != CanopyFacetKind.Auto) writer.Property("kind", Kind == CanopyFacetKind.List ? "list" : "range");
        writer.OptionalProperty("label", _label);
        if (_limit.HasValue) writer.Property("limit", _limit.Value);
        if (_bins.HasValue) writer.Property("bins", _bins.Value);
        if (_sort.HasValue) writer.Property("sort", Sort == CanopyFacetSort.Count ? "count" : "value");
        if (Collapsed) writer.Property("collapsed", true);
        writer.EndObject();
    }
}
