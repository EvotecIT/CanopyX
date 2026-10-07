using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// A <c>page</c> document of a bundle held as its parts until its file is written: the envelope before the items, the
/// items as the writer serialized them, and the envelope after them. Writing the parts in order gives exactly the text
/// of the document written whole, so the items are never copied into one string per page, and the page's size is the
/// sum of sizes the writer measured once.
/// </summary>
internal sealed class CanopyBundlePage {
    private readonly string _head;
    private readonly List<string> _items;
    private readonly string _tail;

    /// <param name="parentId">The id of the node whose children these are, or null for the top level.</param>
    /// <param name="offset">The position of the first item in the whole list.</param>
    /// <param name="total">The length of the whole list.</param>
    /// <param name="items">The serialized items of the page.</param>
    /// <param name="itemBytes">The UTF-8 size of the items with a comma each, as the pager counted them.</param>
    /// <param name="next">The reference of the next page of the list, or null for the last.</param>
    internal CanopyBundlePage(string? parentId, int offset, int total, List<string> items, long itemBytes, string? next) {
        var json = new CanopyJsonWriter(128);
        Envelope(json, parentId, offset, total);
        _head = json.ToString();
        _tail = EndEnvelope(json, next).ToString().Substring(_head.Length);
        _items = items;
        // The items are separated by commas, one fewer than the items.
        Bytes = CanopyBundleContext.Utf8.GetByteCount(_head) + CanopyBundleContext.Utf8.GetByteCount(_tail) + itemBytes - (items.Count > 0 ? 1 : 0);
    }

    /// <summary>Gets the UTF-8 size of the page document.</summary>
    internal long Bytes { get; }

    /// <summary>The page document without items, for measuring the envelope a page can get.</summary>
    internal static string Document(string? parentId, int offset, int total, string? next) {
        var json = new CanopyJsonWriter(256);
        Envelope(json, parentId, offset, total);
        return EndEnvelope(json, next).ToString();
    }

    /// <summary>The parts of the page document, in order.</summary>
    internal IEnumerable<string> Parts() {
        yield return _head;
        for (var index = 0; index < _items.Count; index++) {
            if (index > 0) {
                yield return ",";
            }

            yield return _items[index];
        }

        yield return _tail;
    }

    private static void Envelope(CanopyJsonWriter json, string? parentId, int offset, int total) =>
        json.BeginObject().Envelope("page").Name("parent").String(parentId).Property("offset", offset).Property("total", total).Name("items").BeginArray();

    private static CanopyJsonWriter EndEnvelope(CanopyJsonWriter json, string? next) => json.EndArray().Name("next").String(next).EndObject();
}
