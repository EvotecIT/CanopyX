using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// One row of a tree view: a label for the tree column, cells for the other columns, badges, flags, and either
/// inline children or a declaration that children can be loaded later.
/// </summary>
/// <remarks>
/// Ids must be unique within a view; search results, deep links, and remembered state refer to nodes by id path.
/// Hosts compute every rollup value, badge, and flag; the runtime never aggregates data.
/// </remarks>
public sealed class CanopyNode {
    private string _label;
    private int? _childCount;
    private string? _ref;
    private Dictionary<string, CanopyCell>? _cells;
    private List<CanopyBadge>? _badges;
    private List<string>? _flags;
    private Dictionary<string, string>? _data;
    private List<CanopyNode>? _children;

    /// <summary>Creates a node.</summary>
    /// <param name="id">The id, unique within the view.</param>
    /// <param name="label">The text shown in the tree column; also used for type-ahead, search, and the outline.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is null, empty, or contains unpaired surrogates.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="label"/> is null.</exception>
    public CanopyNode(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));

        Id = id;
        _label = label ?? throw new ArgumentNullException(nameof(label));
    }

    /// <summary>Gets the id, unique within the view.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the text shown in the tree column.</summary>
    /// <exception cref="ArgumentNullException">The value is null.</exception>
    public string Label {
        get => _label;
        set => _label = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>
    /// Gets or sets a host category such as <c>folder</c> or <c>file</c>. It is written to the row as
    /// <c>data-kind</c> for styling and passed to host callbacks.
    /// </summary>
    public string? Kind { get; set; }

    /// <summary>Gets or sets the key of an icon declared in <see cref="CanopyTreeView.Icons"/>.</summary>
    public string? Icon { get; set; }

    /// <summary>Gets or sets whether the row is a group header, for example a department above its teams.</summary>
    public bool Group { get; set; }

    /// <summary>Gets the cells keyed by column id. The first column shows <see cref="Label"/> unless it has a cell.</summary>
    public IDictionary<string, CanopyCell> Cells => _cells ??= new Dictionary<string, CanopyCell>(StringComparer.Ordinal);

    /// <summary>Gets the badges shown after the label in the tree column.</summary>
    public IList<CanopyBadge> Badges => _badges ??= new List<CanopyBadge>();

    /// <summary>Gets host flags such as <c>changed</c>, used by <see cref="CanopyFilter"/> switches.</summary>
    public IList<string> Flags => _flags ??= new List<string>();

    /// <summary>
    /// Gets facts about the node that the host's own scripts need and that are not cells, badges, or flags: for
    /// example a position in another index, or a level a host renderer turns into a marker. CanopyX shows none of
    /// it and does not search it; the browser runtime hands it to host callbacks as <c>node.data</c>.
    /// </summary>
    public IDictionary<string, string> Data => _data ??= new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets the inline children. Leave empty and set <see cref="HasChildren"/> to load children later.</summary>
    public IList<CanopyNode> Children => _children ??= new List<CanopyNode>();

    /// <summary>
    /// Gets or sets whether the node has children that are not included, so the runtime draws an expander and loads
    /// them from the data source when the node opens. It says nothing about inline children; ask
    /// <see cref="HasInlineChildren"/> for those.
    /// </summary>
    public bool HasChildren { get; set; }

    /// <summary>Gets or sets the total number of children, including those not loaded yet.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative.</exception>
    public int? ChildCount {
        get => _childCount;
        set {
            if (value < 0) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Child count cannot be negative.");
            }

            _childCount = value;
        }
    }

    /// <summary>
    /// Gets or sets an opaque reference the data source uses to load the first page of children. The bundle writer
    /// sets it for sidecar files; remote sources receive it in the children URL. Defaults to the id. Inline views
    /// cannot load children later, so they reject it. A complete remote tree can retain its original reference in
    /// memory while a sidecar bundle replaces it with its generated child-page reference.
    /// </summary>
    /// <exception cref="ArgumentException">The value is empty or contains unpaired surrogates.</exception>
    public string? Ref {
        get => _ref;
        set {
            CanopyIdentifiers.Require(value, nameof(value), allowNull: true);

            _ref = value;
        }
    }

    /// <summary>Gets or sets whether the node starts expanded.</summary>
    public bool Expanded { get; set; }

    /// <summary>Gets or sets the detail content. A node with a detail is shown as a detail row and has no children.</summary>
    public CanopyDetail? Detail { get; set; }

    /// <summary>Gets or sets extra CSS class names added to the row, for host styling.</summary>
    public string? ClassName { get; set; }

    /// <summary>
    /// Gets whether <see cref="Children"/> holds at least one node. The collections of a node are created when they
    /// are first read, so a host that walks a large tree asks this before it reads <see cref="Children"/>, and a
    /// leaf never gets an empty list. The same holds for <see cref="HasCells"/>, <see cref="HasBadges"/>,
    /// <see cref="HasFlags"/>, and <see cref="HasData"/>.
    /// </summary>
    /// <remarks>
    /// This is about the children the node carries. <see cref="HasChildren"/> is the host's declaration that
    /// children load later, and stays false on a node whose children are all inline; a node has children of either
    /// sort when one of the two is true.
    /// </remarks>
    public bool HasInlineChildren => _children != null && _children.Count > 0;

    /// <summary>Gets whether <see cref="Cells"/> holds at least one cell, without creating the collection.</summary>
    public bool HasCells => _cells != null && _cells.Count > 0;

    /// <summary>Gets whether <see cref="Badges"/> holds at least one badge, without creating the collection.</summary>
    public bool HasBadges => _badges != null && _badges.Count > 0;

    /// <summary>Gets whether <see cref="Flags"/> holds at least one flag, without creating the collection.</summary>
    public bool HasFlags => _flags != null && _flags.Count > 0;

    /// <summary>Gets whether <see cref="Data"/> holds at least one item, without creating the collection.</summary>
    public bool HasData => _data != null && _data.Count > 0;

    /// <summary>Gets the record-only values of the view's record panel (<see cref="CanopyRecordPanel.Fields"/>), by field id. They show
    /// in the record drawer only and are never searched, sorted or exported.</summary>
    public IDictionary<string, CanopyCell> Fields => _fields ??= new Dictionary<string, CanopyCell>(StringComparer.Ordinal);

    /// <summary>Gets whether <see cref="Fields"/> holds a value, without creating the collection.</summary>
    public bool HasFields => _fields != null && _fields.Count > 0;

    private Dictionary<string, CanopyCell>? _fields;

    /// <summary>The record field values, or null when there are none yet.</summary>
    internal Dictionary<string, CanopyCell>? FieldMap => _fields;

    /// <summary>The cells, or null when there are none yet, for walking them without an enumerator object.</summary>
    internal Dictionary<string, CanopyCell>? CellMap => _cells;

    internal IReadOnlyList<CanopyNode> ChildNodes => _children ?? (IReadOnlyList<CanopyNode>)Array.Empty<CanopyNode>();

    /// <summary>Checks the rules every node must follow, independent of a view.</summary>
    internal void ValidateShape(bool replacingInlineRef = false, int structureDepth = 0) {
        // Detail collections are public; use their canonical writer validation for every renderer, without the text.
        if (Detail != null) {
            Detail.ValidateStructure(structureDepth);
            Detail.WriteJson(CanopyJsonWriter.Discarding());
        }
        if (_ref != null && HasInlineChildren && !replacingInlineRef) {
            throw new InvalidOperationException("Node '" + Id + "' has both inline children and a load reference; inline children must be complete.");
        }
        if (_ref != null && !HasChildren && !HasInlineChildren) {
            throw new InvalidOperationException("Node '" + Id + "' has a reference but no children; set HasChildren for children that load later.");
        }
        if (Detail != null && (HasInlineChildren || HasChildren)) {
            throw new InvalidOperationException("Node '" + Id + "' has a detail and children; a detail row must be a leaf.");
        }

        ValidateContent(structureDepth);
        if (_childCount.HasValue) {
            if (HasInlineChildren && _childCount.Value != _children!.Count) {
                throw new InvalidOperationException("Node '" + Id + "' has " + _children.Count + " inline children but a child count of " + _childCount.Value + "; inline children must be complete.");
            }

            if (!HasInlineChildren && !HasChildren) {
                throw new InvalidOperationException("Node '" + Id + "' has a child count but no children; set HasChildren for children that load later.");
            }

            if (_childCount.Value == 0) {
                throw new InvalidOperationException("Node '" + Id + "' declares children with a child count of zero.");
            }
        }
    }

    /// <summary>Checks the cells, badges, and flags, which do not depend on how the node's children are delivered.</summary>
    internal void ValidateContent(int structureDepth = 0) {
        CanopyCell.ValidateEntries(_cells, structureDepth);
        CanopyCell.ValidateEntries(_fields, structureDepth);
        if (_badges != null) {
            foreach (var badge in _badges) {
                if (badge == null) {
                    throw new InvalidOperationException("Node '" + Id + "' has a null badge.");
                }
            }
        }

        if (_flags != null) {
            foreach (var flag in _flags) {
                if (string.IsNullOrEmpty(flag)) {
                    throw new InvalidOperationException("Node '" + Id + "' has an empty flag.");
                }
            }
        }

        if (_data != null) {
            foreach (var item in _data) {
                // A sidecar file is a script, where "__proto__" in an object literal sets the prototype instead of a field.
                if (item.Key.Length == 0 || item.Key == "__proto__" || item.Value == null) {
                    throw new InvalidOperationException("Node '" + Id + "' has a data item with an empty or reserved name, or a null value.");
                }
            }
        }
    }

    /// <summary>
    /// Writes the node for a bundle page. The bundle writer, not the node, says whether there are children and where
    /// their first page is, so <see cref="HasChildren"/>, <see cref="ChildCount"/>, and <see cref="Ref"/> are not read.
    /// </summary>
    /// <param name="writer">The writer.</param>
    /// <param name="childrenReference">The reference of the first children page, or null for a leaf.</param>
    /// <param name="childCount">The number of children; zero for a leaf.</param>
    /// <exception cref="InvalidOperationException">The node breaks a protocol rule, or a detail row has children.</exception>
    internal void WriteBundleItem(CanopyJsonWriter writer, string? childrenReference, int childCount) {
        if (Detail != null && childCount > 0) {
            throw new InvalidOperationException("Node '" + Id + "' has a detail and children; a detail row must be a leaf.");
        }

        // Writing the detail checks it, so it is not serialized a second time just to validate it.
        ValidateContent();
        WriteHead(writer);
        if (childCount > 0) {
            writer.Property("hasChildren", true).Property("childCount", childCount).Property("ref", childrenReference);
        }

        WriteTail(writer);
        writer.EndObject();
    }

    /// <summary>
    /// Writes the node with its inline children, iteratively, or with its declaration of children that load later.
    /// Callers check the whole tree with <see cref="CanopyTreeValidator"/> first (the view and page documents do), so
    /// the nodes are not checked a second time here.
    /// </summary>
    internal void WriteJson(CanopyJsonWriter writer) {
        if (!WriteStart(writer)) {
            writer.EndObject();
            return;
        }
        var pending = new Stack<(CanopyNode Node, int Index)>();
        pending.Push((this, 0));
        while (pending.Count > 0) {
            var (node, index) = pending.Pop();
            if (index == node.ChildNodes.Count) {
                writer.EndArray().EndObject();
            } else {
                pending.Push((node, index + 1));
                var child = node.ChildNodes[index];
                if (child.WriteStart(writer)) pending.Push((child, 0));
                else writer.EndObject();
            }
        }
    }

    /// <summary>Writes the node up to its inline children; returns whether the children array was opened.</summary>
    private bool WriteStart(CanopyJsonWriter writer) {
        WriteHead(writer);
        var inline = HasInlineChildren;
        if (inline || HasChildren) {
            writer.Property("hasChildren", true);
            writer.OptionalProperty("childCount", _childCount ?? (inline ? _children!.Count : (int?)null));
            if (!inline) {
                writer.OptionalProperty("ref", _ref);
            }
        }

        WriteTail(writer);
        if (inline) {
            writer.Name("children").BeginArray();
        }

        return inline;
    }

    private void WriteHead(CanopyJsonWriter writer) {
        writer.BeginObject().Property("id", Id).Property("label", _label);
        writer.OptionalProperty("kind", Kind);
        writer.OptionalProperty("icon", Icon);
        if (Group) {
            writer.Property("group", true);
        }

        if (HasCells) {
            writer.Name("cells").BeginObject();
            foreach (var cell in _cells!) {
                writer.Name(cell.Key);
                if (cell.Value == null) {
                    writer.Null();
                } else {
                    cell.Value.WriteJson(writer);
                }
            }

            writer.EndObject();
        }

        if (HasBadges) {
            writer.Name("badges").BeginArray();
            foreach (var badge in _badges!) {
                badge.WriteJson(writer);
            }

            writer.EndArray();
        }

        if (HasFlags) {
            writer.StringArray("flags", _flags!);
        }

        if (HasData) {
            writer.Name("data").BeginObject();
            foreach (var item in _data!) {
                writer.Property(item.Key, item.Value);
            }

            writer.EndObject();
        }

        if (HasFields) {
            writer.Name("fields").BeginObject();
            foreach (var field in _fields!) {
                writer.Name(field.Key);
                if (field.Value == null) writer.Null(); else field.Value.WriteJson(writer);
            }

            writer.EndObject();
        }

    }

    private void WriteTail(CanopyJsonWriter writer) {
        if (Expanded) {
            writer.Property("expanded", true);
        }

        if (Detail != null) {
            writer.Name("detail");
            Detail.WriteJson(writer);
        }

        writer.OptionalProperty("className", ClassName);
    }
}
