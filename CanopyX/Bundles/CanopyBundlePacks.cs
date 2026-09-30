using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// Collects children pages into pack files (see "Packs" in docs/data-protocol.md). A pack holds the pages of many
/// nodes up to the bundle's file budget, so a tree with a hundred thousand small child lists becomes a few hundred
/// files instead of a hundred thousand. Pages are appended in the order the writer finishes them, which keeps the
/// pages of one subtree next to each other.
/// </summary>
/// <remarks>
/// A page is stored as the text of its JSON document, and the runtime parses only the page it shows. In the script
/// file that text is a <c>String.raw</c> template, which needs no escaping: <see cref="CanopyJsonWriter"/> never
/// writes a backtick or <c>${</c>.
/// </remarks>
internal sealed class CanopyBundlePacks {
    private const string PageStart = "String.raw`";
    private const string PageEnd = "`";
    private const string DocumentEnd = "]}";

    private readonly CanopyBundleContext _context;
    private readonly Func<int, string> _fileOf;
    private readonly string _documentStart;
    private readonly List<string> _pages = new List<string>();
    private long _bytes;
    private int _pack;

    /// <param name="context">The bundle write.</param>
    /// <param name="fileOf">The reference of pack n; children packs by default.</param>
    /// <param name="targetBytes">A pack size below the file budget, or null for the budget.</param>
    internal CanopyBundlePacks(CanopyBundleContext context, Func<int, string>? fileOf = null, int? targetBytes = null) {
        _context = context;
        _fileOf = fileOf ?? CanopyBundleLayout.Pack;
        var envelope = new CanopyJsonWriter(64);
        envelope.BeginObject().Envelope("pack").Name("pages").BeginArray().EndArray().EndObject();
        var document = envelope.ToString();
        // The envelope ends with "[]}"; the pages go between the brackets.
        _documentStart = document.Substring(0, document.Length - DocumentEnd.Length);
        // A pack number no bundle reaches, so the measured envelope is never too short.
        var budget = context.ItemBudget(_fileOf(int.MaxValue), document);
        FileBudget = budget;
        Budget = targetBytes.HasValue ? Math.Max(1, Math.Min(budget, targetBytes.Value)) : budget;
    }

    /// <summary>Gets the bytes a pack has for its pages, each with the overhead <see cref="SizeOf"/> counts.</summary>
    internal int Budget { get; }

    /// <summary>Gets the number of pack files written so far.</summary>
    internal int Count => _pack;

    /// <summary>Gets the bytes a pack could hold for its pages within the file budget, whatever size it is filled to.</summary>
    internal int FileBudget { get; }

    /// <summary>Gets the number of pages in the pack that is still open.</summary>
    internal int Pending => _pages.Count;

    /// <summary>The bytes a page takes in a pack: its JSON text, the template around it, and a comma.</summary>
    internal static long SizeOf(string pageJson) => CanopyBundleContext.Utf8.GetByteCount(pageJson) + PageStart.Length + PageEnd.Length + 1;

    /// <summary>Adds a page and returns its reference. A page that does not fit the current pack starts the next one.</summary>
    internal string Add(string pageJson) {
        var size = SizeOf(pageJson);
        if (_pages.Count > 0 && _bytes + size > Budget) {
            Flush();
        }

        _pages.Add(pageJson);
        _bytes += size;
        return CanopyBundleLayout.PackedPage(_pack, _pages.Count - 1);
    }

    /// <summary>Writes the pack that is still open, if it holds a page.</summary>
    internal void Flush() {
        if (_pages.Count == 0) {
            return;
        }

        _context.WriteFile(_fileOf(_pack), Parts());
        _pages.Clear();
        _bytes = 0;
        _pack++;
    }

    private IEnumerable<string> Parts() {
        yield return _documentStart;
        for (var index = 0; index < _pages.Count; index++) {
            yield return index == 0 ? PageStart : "," + PageStart;
            yield return _pages[index];
            yield return PageEnd;
        }

        yield return DocumentEnd;
    }
}
