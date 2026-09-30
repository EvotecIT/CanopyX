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

    /// <summary>Gets or sets the key of an icon declared in <see cref="CanopyView.Icons"/>.</summary>
    public string? Icon { get; set; }

    /// <summary>Gets or sets whether the row is a group header, for example a department above its teams.</summary>
    public bool Group { get; set; }

    /// <summary>Gets the cells keyed by column id. The first column shows <see cref="Label"/> unless it has a cell.</summary>
    public IDictionary<string, CanopyCell> Cells => _cells ??= new Dictionary<string, CanopyCell>(StringComparer.Ordinal);

    /// <summary>Gets the badges shown after the label in the tree column.</summary>
    public IList<CanopyBadge> Badges => _badges ??= new List<CanopyBadge>();

    /// <summary>Gets host flags such as <c>changed</c>, used by <see cref="CanopyFilter"/> switches.</summary>
    public IList<string> Flags => _flags ??= new List<string>();

    /// <summary>Gets the inline children. Leave empty and set <see cref="HasChildren"/> to load children later.</summary>
    public IList<CanopyNode> Children => _children ??= new List<CanopyNode>();

    /// <summary>
    /// Gets or sets whether the node has children that are not included, so the runtime draws an expander and loads
    /// them from the data source when the node opens.
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

    internal bool HasInlineChildren => _children != null && _children.Count > 0;

    internal bool HasCells => _cells != null && _cells.Count > 0;

    internal bool HasBadges => _badges != null && _badges.Count > 0;

    internal bool HasFlags => _flags != null && _flags.Count > 0;

    internal IEnumerable<KeyValuePair<string, CanopyCell>> CellEntries => _cells ?? (IEnumerable<KeyValuePair<string, CanopyCell>>)Array.Empty<KeyValuePair<string, CanopyCell>>();

    internal IReadOnlyList<CanopyNode> ChildNodes => _children ?? (IReadOnlyList<CanopyNode>)Array.Empty<CanopyNode>();

    /// <summary>Checks the rules every node must follow, independent of a view.</summary>
    internal void ValidateShape(bool replacingInlineRef = false) {
        // Detail collections are public; use their canonical writer validation for every renderer.
        if (Detail != null) Detail.WriteJson(new CanopyJsonWriter());
        if (_ref != null && HasInlineChildren && !replacingInlineRef) {
            throw new InvalidOperationException("Node '" + Id + "' has both inline children and a load reference; inline children must be complete.");
        }
        if (_ref != null && !HasChildren && !HasInlineChildren) {
            throw new InvalidOperationException("Node '" + Id + "' has a reference but no children; set HasChildren for children that load later.");
        }
        if (Detail != null && (HasInlineChildren || HasChildren)) {
            throw new InvalidOperationException("Node '" + Id + "' has a detail and children; a detail row must be a leaf.");
        }

        ValidateContent();
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
    internal void ValidateContent() {
        CanopyCell.ValidateEntries(CellEntries);
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

    /// <summary>Writes the node with its inline children, iteratively, or with its declaration of children that load later.</summary>
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
        ValidateShape();
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
