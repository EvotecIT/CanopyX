using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Settings of a paged grid's pager: page-size choices, which controls show, numbered pages and the result text.</summary>
/// <remarks>
/// Every setting keeps the built-in pager when left at its default, and then nothing is written. A paged view with any other
/// setting writes a <c>pager</c> object; the browser loads the pager part (<c>canopyx-pager.js</c>) for it, which single-file pages
/// carry. Continuous grids have no pager and ignore these settings. The matching API (<c>setPageLength</c>, <c>goToPage</c>) stays
/// available whatever shows.
/// </remarks>
public sealed class CanopyGridPager {
    private int _pageNumbers;

    /// <summary>Gets the page-size choices in menu order. Empty keeps the built-in 10, 25, 50, 100 and, for inline data, All.</summary>
    /// <remarks>At most 16 unique choices. <see cref="CanopyGridPageLength.All"/> needs an inline source. The current length stays
    /// choosable when it is not listed.</remarks>
    public IList<CanopyGridPageLength> PageLengths { get; } = new List<CanopyGridPageLength>();

    /// <summary>Gets or sets whether the rows-per-page menu shows. Defaults to true.</summary>
    public bool PageLengthMenu { get; set; } = true;

    /// <summary>Gets or sets how many numbered page buttons show: 0 for none (the default), or 5 to 15.</summary>
    /// <remarks>When there are more pages, the first and last page stay and a window around the current page fills the rest, with
    /// gaps between. Phones show at most five.</remarks>
    /// <exception cref="ArgumentOutOfRangeException">The value is not 0 or between 5 and 15.</exception>
    public int PageNumbers {
        get => _pageNumbers;
        set {
            if (value != 0 && (value < 5 || value > 15)) throw new ArgumentOutOfRangeException(nameof(value), value, "Numbered pages are 0 or 5 to 15 buttons.");
            _pageNumbers = value;
        }
    }

    /// <summary>Gets or sets whether the page number field shows. Null (the default) shows it unless numbered pages show.</summary>
    public bool? PageInput { get; set; }

    /// <summary>Gets or sets whether the first-page and last-page buttons show. Defaults to true.</summary>
    public bool FirstLast { get; set; } = true;

    /// <summary>Gets or sets the result text. Defaults to the compact range.</summary>
    public CanopyGridPagerInfo Info { get; set; }

    /// <summary>Gets whether every setting is at its default, which keeps the built-in pager and writes no <c>pager</c> object.</summary>
    public bool IsDefault => PageLengths.Count == 0 && PageLengthMenu && PageNumbers == 0 && PageInput == null && FirstLast && Info == CanopyGridPagerInfo.Range;

    internal void Validate(CanopyGridSourceKind source) {
        if (Info != CanopyGridPagerInfo.Range && Info != CanopyGridPagerInfo.Sentence && Info != CanopyGridPagerInfo.None)
            throw new ArgumentOutOfRangeException(nameof(Info), Info, "Unknown pager result text.");
        if (PageLengths.Count > 16) throw new InvalidOperationException("A pager offers at most 16 page sizes.");
        var seen = new HashSet<int>();
        foreach (var choice in PageLengths) {
            if (choice == null) throw new InvalidOperationException("Page-size choices cannot be null.");
            if (choice.IsAll && source != CanopyGridSourceKind.Inline) throw new InvalidOperationException("Only inline sources offer every row as a page size.");
            if (!seen.Add(choice.Length ?? 0)) throw new InvalidOperationException("Page-size choices must be unique.");
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (PageLengths.Count > 0) {
            writer.Name("lengths").BeginArray();
            foreach (var choice in PageLengths) {
                if (choice.Label == null) {
                    if (choice.IsAll) writer.String("all"); else writer.Number(choice.Length!.Value);
                    continue;
                }
                writer.BeginObject().Name("value");
                if (choice.IsAll) writer.String("all"); else writer.Number(choice.Length!.Value);
                writer.Property("label", choice.Label).EndObject();
            }
            writer.EndArray();
        }
        if (!PageLengthMenu) writer.Property("lengthMenu", false);
        if (PageNumbers != 0) writer.Property("numbers", PageNumbers);
        if (PageInput.HasValue) writer.Property("pageInput", PageInput.Value);
        if (!FirstLast) writer.Property("firstLast", false);
        if (Info != CanopyGridPagerInfo.Range) writer.Property("info", Info == CanopyGridPagerInfo.Sentence ? "sentence" : "none");
        writer.EndObject();
    }
}
