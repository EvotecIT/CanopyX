using System.Collections.Generic;
using System.Text;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// A document of a bundle (a children page, a search entry file, a search shard) held as its parts until its file is
/// written: the fixed text of the document around one or more arrays, and the items of those arrays as the writer
/// serialized them. Writing the parts in order gives exactly the text of the document written whole, so the items are
/// never copied into one string per document, and its size is the sum of the sizes of its parts.
/// </summary>
internal sealed class CanopyBundleDocument {
    /// <summary>The fixed text: before the first array's items, between the arrays, and after the last one's.</summary>
    private readonly string[] _texts;
    private readonly IReadOnlyList<string>[] _lists;

    /// <param name="emptyDocument">A writer holding the document written with every array empty; it can be reused afterwards.</param>
    /// <param name="listStarts">For each array, the position in <paramref name="emptyDocument"/> right after its <c>[</c>.</param>
    /// <param name="lists">The serialized items of each array; they must not change while the document is pending.</param>
    /// <param name="itemBytes">
    /// The UTF-8 size of all items with a comma each, when the caller has counted it already; null to count it here.
    /// </param>
    internal CanopyBundleDocument(CanopyJsonWriter emptyDocument, int[] listStarts, IReadOnlyList<string>[] lists, long? itemBytes = null) {
        _texts = new string[listStarts.Length + 1];
        long bytes = 0;
        var from = 0;
        for (var index = 0; index <= listStarts.Length; index++) {
            var to = index < listStarts.Length ? listStarts[index] : emptyDocument.Length;
            _texts[index] = emptyDocument.ToString(from, to - from);
            bytes += CanopyBundleContext.Utf8.GetByteCount(_texts[index]);
            from = to;
        }

        _lists = lists;
        if (itemBytes.HasValue) {
            bytes += itemBytes.Value;
        }

        foreach (var list in lists) {
            if (!itemBytes.HasValue) {
                foreach (var item in list) {
                    bytes += CanopyBundleContext.Utf8.GetByteCount(item) + 1;
                }
            }

            // Items are separated by commas, one fewer than the items.
            if (list.Count > 0) {
                bytes--;
            }
        }

        Bytes = bytes;
    }

    /// <summary>Gets the UTF-8 size of the document.</summary>
    internal long Bytes { get; }

    /// <summary>A <c>page</c> document whose item sizes the pager has counted.</summary>
    /// <param name="parentId">The id of the node whose children these are, or null for the top level.</param>
    /// <param name="offset">The position of the first item in the whole list.</param>
    /// <param name="total">The length of the whole list.</param>
    /// <param name="items">The serialized items of the page.</param>
    /// <param name="itemBytes">The UTF-8 size of the items with a comma each.</param>
    /// <param name="next">The reference of the next page of the list, or null for the last.</param>
    /// <param name="json">A writer to write the envelope with; it is reset first and can be reused afterwards.</param>
    internal static CanopyBundleDocument Page(CanopyJsonWriter json, string? parentId, int offset, int total, List<string> items, long itemBytes, string? next) {
        PageStart(json.Reset(), parentId, offset, total);
        var start = json.Length;
        return new CanopyBundleDocument(PageEnd(json, next), new[] { start }, new IReadOnlyList<string>[] { items }, itemBytes);
    }

    /// <summary>The page document without items, for measuring the envelope a page can get.</summary>
    /// <param name="json">A writer to write it with; it is reset first and can be reused afterwards.</param>
    /// <param name="parentId">The id of the node whose children the page holds, or null for the top level.</param>
    /// <param name="offset">The position of the first item in the whole list.</param>
    /// <param name="total">The length of the whole list.</param>
    /// <param name="next">The reference of the next page of the list, or null for the last.</param>
    internal static string PageEnvelope(CanopyJsonWriter json, string? parentId, int offset, int total, string? next) {
        PageStart(json.Reset(), parentId, offset, total);
        return PageEnd(json, next).ToString();
    }

    /// <summary>The parts of the document, in order.</summary>
    internal IEnumerable<string> Parts() {
        for (var index = 0; index < _lists.Length; index++) {
            yield return _texts[index];
            var list = _lists[index];
            for (var item = 0; item < list.Count; item++) {
                if (item > 0) {
                    yield return ",";
                }

                yield return list[item];
            }
        }

        yield return _texts[_lists.Length];
    }

    /// <summary>The document as one string, for measuring a small one.</summary>
    internal string Text() {
        var text = new StringBuilder();
        foreach (var part in Parts()) {
            text.Append(part);
        }

        return text.ToString();
    }

    private static void PageStart(CanopyJsonWriter json, string? parentId, int offset, int total) =>
        json.BeginObject().Envelope("page").Name("parent").String(parentId).Property("offset", offset).Property("total", total).Name("items").BeginArray();

    private static CanopyJsonWriter PageEnd(CanopyJsonWriter json, string? next) => json.EndArray().Name("next").String(next).EndObject();
}
