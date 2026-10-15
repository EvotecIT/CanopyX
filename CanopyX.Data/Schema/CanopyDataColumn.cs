namespace CanopyX.Data;

/// <summary>A column a remote request may reference: declared by the grid view and allowed by the server.</summary>
/// <remarks>
/// Requests are resolved against these descriptors before a provider sees them, so a provider only receives columns
/// on the allow-list, operators that fit the column kind and operands already converted to typed values.
/// </remarks>
public sealed class CanopyDataColumn {
    internal CanopyDataColumn(CanopyColumn definition, int ordinal, bool filterable, bool searchable, bool explicitlySearchable, bool facetable) {
        Definition = definition;
        Ordinal = ordinal;
        Filterable = filterable;
        Searchable = searchable;
        ExplicitlySearchable = explicitlySearchable;
        Facetable = facetable;
    }

    /// <summary>Gets the declared view column.</summary>
    public CanopyColumn Definition { get; }

    /// <summary>Gets the column identity used on the wire.</summary>
    public string Id => Definition.Id;

    /// <summary>Gets the column title.</summary>
    public string Title => Definition.Title;

    /// <summary>Gets the raw value kind: text (strings and booleans), number or date.</summary>
    public CanopyColumnKind Kind => Definition.Kind;

    /// <summary>Gets whether requests may sort by this column.</summary>
    public bool Sortable => Definition.Sortable;

    /// <summary>Gets the declared text ordering policy, if any.</summary>
    public CanopyGridOrdering? Ordering => Definition.Ordering;

    /// <summary>Gets the position of this column among the allowed columns.</summary>
    public int Ordinal { get; }

    /// <summary>Gets whether requests may filter on this column.</summary>
    public bool Filterable { get; }

    /// <summary>Gets whether quick search reads this column.</summary>
    public bool Searchable { get; }

    /// <summary>Gets whether the view lists this column in its search columns, rather than searching every column by default.</summary>
    /// <remarks>Database providers search number and date columns only when they are listed explicitly.</remarks>
    public bool ExplicitlySearchable { get; }

    /// <summary>Gets whether the view declares a value list (facet) for this column.</summary>
    public bool Facetable { get; }
}
