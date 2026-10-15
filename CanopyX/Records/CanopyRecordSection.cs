using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A section of the record panel: a collapsible group of fields, nested sections, or content a renderer draws.</summary>
public sealed class CanopyRecordSection {
    private static readonly Regex RendererName = new Regex("^[a-z][a-z0-9-]{0,31}$", RegexOptions.CultureInvariant);
    private string? _renderer;

    /// <summary>Creates a section.</summary>
    /// <param name="id">The section id, unique within the record panel; tabs list sections by id.</param>
    /// <param name="label">The visible heading, 1 to 256 characters.</param>
    /// <exception cref="ArgumentException">The id is empty or the label is blank or too long.</exception>
    public CanopyRecordSection(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        if (string.IsNullOrWhiteSpace(label) || label.Length > 256) throw new ArgumentException("A section label has 1 to 256 visible characters.", nameof(label));
        Id = id;
        Label = label;
    }

    /// <summary>Gets the section id.</summary>
    public string Id { get; }

    /// <summary>Gets the visible heading.</summary>
    public string Label { get; }

    /// <summary>Gets the ids of the columns and record fields the section shows, in order. A field shows in the first section that lists it.</summary>
    public IList<string> Fields { get; } = new List<string>();

    /// <summary>Gets the nested sections; sections nest at most three levels, the top level included.</summary>
    public IList<CanopyRecordSection> Sections { get; } = new List<CanopyRecordSection>();

    /// <summary>Gets or sets whether the section starts collapsed.</summary>
    public bool Collapsed { get; set; }

    /// <summary>
    /// Gets or sets the name of a section renderer: a browser plugin's <c>drawerSections</c> entry or the host's <c>recordSections</c>
    /// option, which draws content (a chart, for example) above the section's fields.
    /// </summary>
    /// <exception cref="ArgumentException">The name is not 1 to 32 lowercase letters, digits and hyphens starting with a letter.</exception>
    public string? Renderer {
        get => _renderer;
        set => _renderer = value != null && !RendererName.IsMatch(value) ? throw new ArgumentException("A section renderer name is 1 to 32 lowercase letters, digits and hyphens.", nameof(value)) : value;
    }

    internal void Validate(ISet<string> sections, ISet<string> fields, int depth) {
        if (depth > 2) throw new InvalidOperationException("Record sections nest at most three levels.");
        if (!sections.Add(Id)) throw new InvalidOperationException("Record section ids must be unique: " + Id + ".");
        foreach (var field in Fields) if (field == null || !fields.Contains(field)) throw new InvalidOperationException("Record section '" + Id + "' lists an undeclared field: " + field + ".");
        foreach (var section in Sections) (section ?? throw new InvalidOperationException("A record section cannot contain a null section.")).Validate(sections, fields, depth + 1);
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("label", Label);
        if (Fields.Count > 0) writer.StringArray("fields", Fields);
        if (Collapsed) writer.Property("collapsed", true);
        writer.OptionalProperty("renderer", _renderer);
        if (Sections.Count > 0) {
            writer.Name("sections").BeginArray();
            foreach (var section in Sections) section.WriteJson(writer);
            writer.EndArray();
        }
        writer.EndObject();
    }
}
