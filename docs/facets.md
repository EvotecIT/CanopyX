# Facet panel

A facet panel sits beside or above a grid and keeps the values a reader can filter by in view: a value list with counts for
each chosen column, and a range with a histogram for number and date columns. The facets filter each other: each counts the
current result without its own column's conditions, so it still shows every value the reader can switch to, while the other
facets and the search narrow it.

- **Value lists** with counts, the most frequent values first (or by value), "Show N more", and a search box in long lists.
- **Ranges** for numbers and dates: From and To fields and a histogram CanopyX draws itself, with no chart library.
- **Clear** per facet and **Clear all**.
- **Collapsible**, beside the grid or above it; the open state is part of saved views.
- **Phones:** where the panel does not fit, a **Filter by** button in the toolbar opens it as a full-screen sheet.
- **Remote grids** count through the existing value lists (`gridFacetQuery`), which `CanopyX.Data` answers.
- **Accessible:** named sections that collapse, checkboxes named by their value and count, arrow keys inside a list, and the
  result count announced after a choice.

The panel ships as the lazy `facets` part (`canopyx-facets.js` and `.css`), which a grid loads with its first query when its
view or options declare `facets`.

## A first facet panel

```csharp
var view = new CanopyDataGridView("requests", "Requests") { StateKey = "requests" };
view.Columns.Add(new CanopyColumn("subject", "Subject"));
view.Columns.Add(new CanopyColumn("category", "Category"));
view.Columns.Add(new CanopyColumn("priority", "Priority") { Presenter = CanopyGridPresenter.State(tones) });
view.Columns.Add(new CanopyColumn("opened", "Opened") { Kind = CanopyColumnKind.DateTime });
view.Columns.Add(new CanopyColumn("age", "Age (days)") { Kind = CanopyColumnKind.Number });
view.FacetPanel = new CanopyFacetPanel().Add("category").Add("priority").Add("opened").Add("age");
```

The same panel in a view document:

```json
{ "facets": { "columns": ["category", "priority", "opened", { "column": "age", "bins": 12 }], "position": "side" } }
```

`FacetPanelExample` in `CanopyX.Examples` writes `facets.html` (the panel beside the grid) and `facets-top.html` (above it),
each also in a dark palette.

## Facets

Each entry of `columns` (`CanopyFacetPanel.Facets`) is a column id, or an object:

| Field | C# (`CanopyFacet`) | Default | Meaning |
| --- | --- | --- | --- |
| `column` | `Column` | | The column. Each column once; 1 to 24 facets. |
| `kind` | `Kind` | `list` for text, `range` for number and date columns | `list` or `range` (`CanopyFacetKind`). A number column can be a list. |
| `label` | `Label` | the column's title | The facet's heading. |
| `limit` | `Limit` | 8 | Values a list shows before "Show N more" (1 to 200). |
| `bins` | `Bins` | 16 | Bars in a range's histogram (2 to 60). |
| `sort` | `Sort` | `count` | `count` (most frequent first) or `value` (as the column's value lists order values). |
| `collapsed` | `Collapsed` | false | Starts the facet collapsed to its heading. |

### Value lists

A list shows the column's values with their counts over the result without this column's conditions. Values show as the
column's cells show them (a state presenter's pill, for example); an empty cell is "(Empty)". Ticking values filters the
column to them (`in`, with `isNull` for the empty value); unticking the last one clears the column. A value the other facets
exclude stays listed with a zero count while it is ticked, so it can be unticked.

Above twelve values a search box narrows the list (a hosted grid searches at its source). A hosted grid's list is bounded to
200 values; when there are more, a note says how many and the search finds the others.

### Ranges

A range draws the column's distribution as equal-width bars over the result without this column's conditions; the bars
inside the chosen range use the accent colour, and each bar's tooltip gives its span and count. **From** and **To** (number
fields, or date fields in the grid's time zone, whole days) set the bounds (`ge` and `le`), on change or Enter. A click on a bar
chooses its span, from its start up to the next bar's start (`lt`; the last bar includes the maximum), Shift+click extends the
range, and a click on the chosen bar clears it. A hosted grid draws the histogram
from its value list when the list is complete (200 values or fewer); otherwise it keeps the fields and says "Too many values
to chart".

### Conditions the panel cannot show

The panel's choices are the reader's own column conditions, so other controls can change them too. A column whose conditions
are not a list of values or a range (a "contains" condition, or part of a condition group from the filter builder) shows
"Another condition filters this column." with Clear; ticking a value replaces that condition. When the column is part of a
condition group that also tests other columns (an Any group from the filter builder), the facet cannot change it without
changing those columns too, so its controls are disabled until that group changes; Clear all leaves the group in place.

## The panel

| Field (`facets`) | C# (`CanopyFacetPanel`) | Default | Meaning |
| --- | --- | --- | --- |
| `columns` | `Facets` | | The facets, in order. |
| `position` | `Position` | `side` | `side` (beside the grid) or `top` (above it, its facets side by side). |
| `open` | `Open` | true | Whether the panel starts open; the reader's choice is part of the grid state. |
| `collapsible` | `Collapsible` | true | Whether the reader can collapse it. |
| `width` | `Width` | 260 | A side panel's width in pixels (180 to 480). |
| `label` | `Label` | "Filter by" | The panel's heading. |
| `target` (option only) | | | An element the panel renders into, for a host that lays out the page itself. |

The panel and the grid's element share a frame (`cx-facet-frame`) that takes the grid element's place; destroying the grid
puts the element back. With `target`, the panel renders into that element and the grid's element stays where it is.

A side panel needs room for itself and 480 pixels of grid; a top panel needs more than 640 pixels. Where it does not fit, the
panel leaves the page and a **Filter by** button (with the number of active facets) in the toolbar opens it as a full-screen
sheet with **Clear all** and **Done**; focus returns to the button when the sheet closes.

Collapsed, a side panel is a narrow rail with its switch, and a top panel keeps its heading.

## Saved views and the API

The choices are column conditions of the query, so condition chips show them, Clear all removes them, and saved views,
remembered state, exports and print carry them. The grid state also keeps the panel's open state as `facets: { open }`.

| Member | Meaning |
| --- | --- |
| `getFacetPanel()` | `{ open, columns, active }`: whether the panel is open, its facet columns and how many are active. |
| `setFacetPanelOpen(open)` | Opens or collapses the panel; resolves with `getFacetPanel()`. |
| `canopyx:facetPanel` | After the reader opens or collapses the panel, with `{ open }`. |

## Remote grids

A hosted grid's facets must be declared facet columns (`reporting.facetColumns`, C# `CanopyGridReporting.FacetColumns`); the
writer and the browser refuse others. Each facet sends a `gridFacetQuery` with `includeCurrentFilter: false` and up to 200
buckets, through `source.facet` (see [Value lists](data-protocol.md#flat-grid-documents)); `CanopyX.Data` answers it from
`IQueryable<T>` or your provider, and `CanopyRemoteScript` wires it. The panel needs the reporting runtime for hosted grids.

## Performance

Inline facets count every row after each accepted query, one facet at a time with a pause between them, so a large dataset
never blocks the page for long; a newer query cancels a count in progress. Live changes (see [live data](live-data.md)) count
again a moment after the last change.

## Accessibility

The panel is a complementary landmark named by its heading. Each facet's heading is a button with `aria-expanded`, named by
its column and the number of chosen values; Clear buttons name their column. Checkboxes are named by their value and count ("North, 42 rows"); in a list, Up, Down, Home and End
move between them, so a long list is one Tab stop. The histogram is an image named after its column, and From and To are the
keyboard path. After a choice the result count is announced politely. On phones the sheet is a modal dialog with 44 pixel
targets.

## Labels

`gridFacetPanel`, `gridFacetPanelHide`, `gridFacetPanelShow`, `gridFacetShowMore`, `gridFacetShowFewer`, `gridFacetEmptyValue`,
`gridFacetFrom`, `gridFacetTo`, `gridFacetHistogram`, `gridFacetBin`, `gridFacetNoChart`, `gridFacetClear`, `gridFacetCustom`,
`gridFacetResult`, `gridFacetSelected`, `gridFacetValueCount`, `gridFacetCollapse`, `gridFacetExpand`, `gridFacetInvalid` and
`gridFacetReversed` (`CanopyLabels.GridFacet…`),
with Polish, German, Spanish, French and Italian translations.
