using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>A named group of flat-grid columns, drawn as a header above them; groups nest up to three levels.</summary>
/// <remarks>
/// A group lists the columns directly below it and its nested groups. Each column belongs to one group at most, and the
/// columns of a group are adjacent in <see cref="CanopyDataGridView.Columns"/>. The grid keeps a group's columns together
/// when readers move columns, pin a group as a whole and shows each group's title as a record-drawer section on phones.
/// </remarks>
public sealed class CanopyColumnGroup {
    /// <summary>Creates a group.</summary>
    /// <param name="id">The group identity, unique among the grid's groups.</param>
    /// <param name="title">The header text, 1 to 256 characters.</param>
    /// <param name="columns">The identities of the columns directly below the group, in any order.</param>
    /// <exception cref="ArgumentException">The identity or title is invalid.</exception>
    public CanopyColumnGroup(string id, string title, params string[] columns) {
        CanopyIdentifiers.Require(id, nameof(id));
        if (string.IsNullOrWhiteSpace(title) || title.Length > 256) throw new ArgumentException("A column group needs a title of 1 to 256 characters.", nameof(title));
        Id = id;
        Title = title;
        if (columns != null) foreach (var column in columns) Columns.Add(column);
    }

    /// <summary>Gets the group identity used by the API, saved views and the DOM.</summary>
    public string Id { get; }

    /// <summary>Gets the header text.</summary>
    public string Title { get; }

    /// <summary>Gets the identities of the columns directly below the group.</summary>
    public IList<string> Columns { get; } = new List<string>();

    /// <summary>Gets the groups nested below this group.</summary>
    public IList<CanopyColumnGroup> Groups { get; } = new List<CanopyColumnGroup>();

    /// <summary>Gets or sets the initial pin of every column in a top-level group. Null keeps the columns' own pins.</summary>
    /// <remarks>Only a top-level group takes a pin. Pinning any of its columns at run time pins the whole group.</remarks>
    public CanopyGridColumnPin? Pinned { get; set; }

    internal void Validate(IDictionary<string, CanopyColumn> columns, ISet<string> groupIds, ISet<string> grouped, int depth) {
        if (depth > 3) throw new InvalidOperationException("Column groups nest at most three levels.");
        if (!groupIds.Add(Id)) throw new InvalidOperationException("Column group identities must be unique: " + Id);
        if (Columns.Count == 0 && Groups.Count == 0) throw new InvalidOperationException("Column group " + Id + " needs columns or groups.");
        if (Pinned.HasValue && (depth > 1 || !Enum.IsDefined(typeof(CanopyGridColumnPin), Pinned.Value)))
            throw new InvalidOperationException("Only a top-level column group takes a pin, and it must be a known pin.");
        foreach (var id in Columns) {
            if (id == null || !columns.ContainsKey(id) || !grouped.Add(id))
                throw new InvalidOperationException("Column group " + Id + " must name declared columns, each in one group at most.");
        }
        foreach (var group in Groups) {
            if (group == null) throw new InvalidOperationException("Column group " + Id + " has a null nested group.");
            group.Validate(columns, groupIds, grouped, depth + 1);
        }
    }

    /// <summary>The identities of every column below the group, nested groups included.</summary>
    internal IEnumerable<string> Leaves() {
        foreach (var id in Columns) yield return id;
        foreach (var group in Groups) foreach (var id in group.Leaves()) yield return id;
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("title", Title);
        if (Columns.Count > 0) {
            writer.Name("columns").BeginArray();
            foreach (var id in Columns) writer.String(id);
            writer.EndArray();
        }
        if (Groups.Count > 0) {
            writer.Name("groups").BeginArray();
            foreach (var group in Groups) group.WriteJson(writer);
            writer.EndArray();
        }
        if (Pinned.HasValue) {
            writer.Name("pinned");
            if (Pinned == CanopyGridColumnPin.None) writer.Null(); else writer.String(Pinned == CanopyGridColumnPin.Left ? "left" : "right");
        }
        writer.EndObject();
    }
}
