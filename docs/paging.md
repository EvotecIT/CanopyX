# Pager Settings

A paged grid (`presentation: "paged"`) shows a pager below its rows: the visible range, a rows-per-page menu, first, previous, next and last buttons, and a page number field. The optional `pager` object of the grid definition changes it:

- the page-size choices, with their own labels and an All choice for inline data;
- numbered page buttons;
- the result text as a sentence ("Showing 1 to 25 of 300 rows"), with the unfiltered total while a search or filter narrows the rows ("(filtered from 1,000)"), or no result text;
- whether the rows-per-page menu, the page number field and the first and last buttons show.

A grid without `pager`, or with every setting at its default, keeps the built-in pager. Continuous grids have no pager and ignore the settings. The API (`goToPage`, `setPageLength`, `getPaging`) works whatever shows.

## In a view document

```json
{
  "presentation": "paged", "pageLength": 25,
  "pager": {
    "lengths": [10, 25, { "value": 50, "label": "Fifty" }, "all"],
    "numbers": 7,
    "info": "sentence",
    "lengthMenu": true,
    "pageInput": false,
    "firstLast": true
  }
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `lengths` | 10, 25, 50, 100 and All | Page-size choices in menu order, at most 16: rows per page from 1 to 10,000, `"all"` for every row of inline data, or `{ value, label }` with menu text of up to 64 characters. The current page length stays choosable when it is not listed. |
| `lengthMenu` | `true` | The rows-per-page menu. |
| `numbers` | `0` | Numbered page buttons: 0 for none, or 5 to 15. With more pages, the first and last page stay and a window around the current page fills the rest, with gaps between. Phones (640 px and below) show five at most. |
| `pageInput` | shown unless `numbers` | The page number field. |
| `firstLast` | `true` | The first-page and last-page buttons. |
| `info` | `"range"` | `"range"` for "1–25 of 300 rows", `"sentence"` for the sentence, `"none"` for no result text. |

The numbered buttons are ordinary buttons named "Page 3" (the `gridPageButton` label); the current page has `aria-current="page"` and keeps focus after a page change, so keyboard readers stay on the pager. The sentence uses the `gridPageInfo` and `gridPageInfoFiltered` labels, translated in the Polish, German and Spanish packs.

The settings are read by the `pager` part (`canopyx-pager.js` and `canopyx-pager.css`, about 2 KiB gzip). A grid whose view has settings loads it with its first query and keeps the built-in pager hidden until it arrives; if it cannot load, the built-in pager shows and the error is reported. Single-file pages written by .NET carry the part, and `CanopyHtmlAssets.WriteTo` writes it beside the grid runtimes. Invalid settings are reported through the grid's `error` event, and the built-in pager stays; once the part is installed, `createDataGrid` throws for them instead.

## In .NET

```csharp
var grid = new CanopyDataGridView("servers", "Servers") { Presentation = CanopyGridPresentation.Paged, PageLength = 25 };
grid.Pager.PageLengths.Add(10);
grid.Pager.PageLengths.Add(25);
grid.Pager.PageLengths.Add(CanopyGridPageLength.Rows(50, "Fifty"));
grid.Pager.PageLengths.Add(CanopyGridPageLength.All());
grid.Pager.PageNumbers = 7;
grid.Pager.Info = CanopyGridPagerInfo.Sentence;
```

`CanopyGridPager` validates its settings: `PageNumbers` is 0 or 5 to 15, choices are unique, and `CanopyGridPageLength.All()` needs an inline source. `IsDefault` tells whether the view writes a `pager` object.

## From CanopyX.enhance and CanopyX.grid

The short options `pageLengths`, `lengthMenu`, `pageNumbers`, `pageInput`, `firstLast` and `info` set the same fields; there, numbered pages and the sentence are on by default. See [enhance.md](enhance.md#paging).
