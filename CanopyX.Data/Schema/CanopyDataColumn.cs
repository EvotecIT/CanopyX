using System.Collections.Generic;

namespace CanopyX.Data;

/// <summary>A column a remote request may reference: declared by the grid view and allowed by the server.</summary>
/// <remarks>
/// Requests are resolved against these descriptors before a provider sees them, so a provider only receives columns
/// on the allow-list, operators that fit the column kind and operands already converted to typed values.
/// </remarks>
public sealed class CanopyDataColumn {
    private readonly CanopyColumn _definition;
    private readonly CanopyGridOrdering? _ordering;

    internal CanopyDataColumn(CanopyColumn definition, int ordinal, bool filterable, bool searchable, bool explicitlySearchable, bool facetable) {
        _definition = CanopyDataSnapshot.Column(definition);
        _ordering = _definition.ValueOrder.Count != 0 ? new CanopyGridOrdering(CanopyGridTextOrder.Ordinal, _definition.ValueOrder) : _definition.Ordering;
        Ordinal = ordinal;
        Filterable = filterable && definition.Filterable;
        _definition.Filterable = Filterable;
        Searchable = searchable;
        ExplicitlySearchable = explicitlySearchable;
        Facetable = facetable;
    }

    /// <summary>Gets a detached copy of the declared column captured when this schema was created.</summary>
    public CanopyColumn Definition => CanopyDataSnapshot.Column(_definition);

    /// <summary>Gets the column identity used on the wire.</summary>
    public string Id => _definition.Id;

    /// <summary>Gets the column title.</summary>
    public string Title => _definition.Title;

    /// <summary>Gets the raw value kind: text (strings and booleans), number or date.</summary>
    public CanopyColumnKind Kind => _definition.Kind;

    /// <summary>Gets whether requests may sort by this column.</summary>
    public bool Sortable => _definition.Sortable;

    internal void DisableSort() => _definition.Sortable = false;

    /// <summary>Gets whether the captured column starts hidden and is omitted from default exports.</summary>
    public bool Hidden => _definition.Hidden;

    /// <summary>Gets the declared text ordering policy, if any.</summary>
    public CanopyGridOrdering? Ordering => _ordering;

    internal CanopyGridNumberFormat? NumberFormat => _definition.Format;
    internal bool ExactCategoryTokens => _definition.ExactCategoryTokens;
    internal IList<string> ValueOrder => _definition.ValueOrder;
    internal object? FacetSearchValue(object? value) => value is string token && _definition.ValueLabels.TryGetValue(token, out var label) ? label : value;

    /// <summary>Gets the position of this column among the allowed columns.</summary>
    public int Ordinal { get; }

    /// <summary>Gets whether requests may filter on this column.</summary>
    public bool Filterable { get; }

    /// <summary>Gets whether requests may export this allowed column.</summary>
    public bool Exportable => _definition.Exportable;

    /// <summary>Gets whether quick search reads this column.</summary>
    public bool Searchable { get; }

    /// <summary>Gets whether the view lists this column in its search columns, rather than searching every column by default.</summary>
    /// <remarks>Database providers search number and date columns only when they are listed explicitly.</remarks>
    public bool ExplicitlySearchable { get; }

    /// <summary>Gets whether the view declares a value list (facet) for this column.</summary>
    public bool Facetable { get; }

    /// <summary>Gets whether the view declares the column editable, so a commit may change it (subject to the writer and its policy).</summary>
    public bool Editable => _definition.Editable;

    /// <summary>Gets the checks an edited value must pass, as the view declares them, or null.</summary>
    public CanopyCellValidation? Validation => CanopyDataSnapshot.Validation(_definition.Validation);

    /// <summary>Gets the column's typed editor, as the view declares it, or null for the editor of its kind.</summary>
    public CanopyCellEditor? Editor => CanopyDataSnapshot.Editor(_definition.Editor);
}
