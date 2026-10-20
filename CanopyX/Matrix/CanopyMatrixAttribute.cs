using System;

namespace CanopyX;

/// <summary>A property of a matrix axis's items, such as a domain controller's site: shown in its tooltip, used to group, sort and filter.</summary>
public sealed class CanopyMatrixAttribute {
    /// <summary>Creates an attribute.</summary>
    /// <param name="id">The id items key their value by; a nonempty identifier of at most 256 characters.</param>
    /// <param name="title">The title: plain text of at most 200 characters.</param>
    /// <param name="kind">How values sort and format.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty or too long.</exception>
    public CanopyMatrixAttribute(string id, string title, CanopyColumnKind kind = CanopyColumnKind.Text) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Title = title;
        Kind = kind;
    }

    /// <summary>Gets the attribute's id.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the title. Plain text of at most 200 characters.</summary>
    public string Title { get; set; }

    /// <summary>Gets or sets how values sort and format.</summary>
    public CanopyColumnKind Kind { get; set; }

    /// <summary>Gets or sets whether the filter panel lists the attribute's values with their counts, to filter the axis by them.</summary>
    public bool Facet { get; set; }
}
