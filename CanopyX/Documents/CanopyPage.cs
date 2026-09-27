using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// A page of children: the <c>page</c> document of the <c>canopyx/1</c> protocol, returned by sidecar files and
/// remote endpoints when a node opens or the user asks for more.
/// </summary>
public sealed class CanopyPage {
    private int _offset;
    private int? _total;
    private string? _next;

    /// <summary>Creates a page.</summary>
    /// <param name="parentId">The id of the node whose children these are, or <see langword="null"/> for the top level.</param>
    /// <exception cref="ArgumentException"><paramref name="parentId"/> is an empty string.</exception>
    public CanopyPage(string? parentId) {
        if (parentId != null && parentId.Length == 0) {
            throw new ArgumentException("A parent id cannot be empty; use null for the top level.", nameof(parentId));
        }

        ParentId = parentId;
    }

    /// <summary>Gets the id of the parent node, or <see langword="null"/> for the top level.</summary>
    public string? ParentId { get; }

    /// <summary>Gets or sets the index of the first item among all children of the parent.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative.</exception>
    public int Offset {
        get => _offset;
        set {
            if (value < 0) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Offset cannot be negative.");
            }

            _offset = value;
        }
    }

    /// <summary>
    /// Gets or sets the total number of children of the parent, used for "100 of 1,234 loaded" and
    /// <c>aria-setsize</c>. <see langword="null"/> when unknown.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative.</exception>
    public int? Total {
        get => _total;
        set {
            if (value < 0) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Total cannot be negative.");
            }

            _total = value;
        }
    }

    /// <summary>Gets the nodes on this page, in display order. Nodes may carry inline children.</summary>
    public IList<CanopyNode> Items { get; } = new List<CanopyNode>();

    /// <summary>
    /// Gets or sets the continuation for the next page: an opaque value the data source passes back to get the next
    /// page, or <see langword="null"/> when this is the last page.
    /// </summary>
    /// <exception cref="ArgumentException">The value is an empty string.</exception>
    public string? Next {
        get => _next;
        set {
            if (value != null && value.Length == 0) {
                throw new ArgumentException("A continuation cannot be empty; use null for the last page.", nameof(value));
            }

            _next = value;
        }
    }

    /// <summary>Writes the <c>page</c> document.</summary>
    /// <returns>The document as compact, HTML-safe JSON.</returns>
    /// <exception cref="InvalidOperationException">A node breaks a protocol rule, or the total is below the items shown.</exception>
    public string ToJson() {
        var writer = new CanopyJsonWriter(4096);
        WriteJson(writer, static (node, w) => node.WriteJson(w, includeChildren: true));
        return writer.ToString();
    }

    /// <summary>Writes the page, letting the bundle writer decide how each node's lazy-load declaration looks.</summary>
    internal void WriteJson(CanopyJsonWriter writer, Action<CanopyNode, CanopyJsonWriter> writeNode) {
        var end = (long)_offset + Items.Count;
        if (_total.HasValue && _total.Value < end) {
            throw new InvalidOperationException("Page total " + _total.Value + " is below offset " + _offset + " plus " + Items.Count + " items.");
        }
        if (_total.HasValue && ((_next != null) != (end < _total.Value))) {
            throw new InvalidOperationException("Page continuation must agree with the known total.");
        }

        CanopyTreeValidator.Validate(Items, ParentId == null ? "The top-level page" : "The page of '" + ParentId + "'");
        writer.BeginObject().Envelope("page").Name("parent").String(ParentId).Property("offset", _offset);
        writer.OptionalProperty("total", _total);
        writer.Name("items").BeginArray();
        foreach (var item in Items) {
            writeNode(item ?? throw new InvalidOperationException("A page cannot contain a null node."), writer);
        }

        writer.EndArray();
        writer.Name("next").String(_next);
        writer.EndObject();
    }
}
