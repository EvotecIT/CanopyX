# Large reports

CanopyX keeps the rendered DOM small at any size: only the rows in view, a small overscan and the focused row exist as elements. What a large report costs is everything before that: the bytes of the page, parsing the embedded data, building every grid on the page, and the first query over the complete rows. This guide describes the choices that keep those costs down, so the first rows show fast, the rest loads lazily and memory stays bounded, and the numbers measured for each.

## Choosing a delivery

| Delivery | What the page holds | Best for |
| --- | --- | --- |
| Single file, row objects | The runtime, and each grid's rows as objects in its configuration | Small and medium grids; reports that are mailed or attached as one file |
| Single file, compact row data | Each grid's rows as arrays in column order, in chunks inside its host element | Large grids that must stay one file: smaller, and the first rows show after the first chunk |
| Single file, compressed row data | The same chunks, gzip-compressed and base64-encoded | The largest grids that must stay one file: several times smaller; decoding costs a little more while loading |
| Bundle (`SaveBundle`) | A small `index.html`, the runtime as files, and the rows in sidecar files | File shares and web servers; the page opens at once and loads rows chunk by chunk, also from `file://` |
| Hosted source | Only the definition; the host's endpoint answers each query | Datasets too large for the browser, or that change; the host filters, sorts and pages |

Mounting when visible (`MountWhenVisible`) combines with every delivery: a page with many views mounts only those in view, and the others when they are scrolled to, their tab or panel opens, the page prints, or a script asks for them.

A single file chooses among the first three by itself ([below](#how-canopyx-chooses)); a bundle and a hosted source are the
author's choice. Trees keep their own choices: inline nodes for small trees, a bundle for large ones (see [architecture.md](architecture.md#data-flow)).

## How CanopyX chooses

The HTML writer looks at each inline grid's rows when it writes a fragment or a page (`CanopyHtmlOptions.RowData`, whose
`Format` defaults to `Auto`):

- **Up to 5,000 rows** (`CanopyRowDataOptions.CompactAboveRows`): row objects. That is one chunk of compact row data, so
  compact rows would show nothing sooner, and a grid of this size loads quickly either way: 10,000 rows take about 0.2 s at
  normal speed in every format (the measurements below).
- **More than 5,000 rows**: compact row data, in chunks of 5,000. The first rows show after the first chunk and each task stays
  short; at 100,000 rows the first rows come in about half the time of row objects, and the longest task drops from 2.0 s to
  0.6 s at 4x CPU.
- **Compact rows of more than 5 MiB of JSON** (`CanopyRowDataOptions.GzipAboveBytes`, about 25,000 rows of twelve columns):
  compressed row data. From there the size of the file decides the load: 100,000 such rows are 19.4 MB compact and 6.3 MB
  compressed, and the compressed page shows its first rows sooner (1.2 s against 1.4 s at 4x CPU), at the cost of decoding
  everything about 15% later.
- Rows with record fields or a detail payload stay row objects, which have a place for them.

The page carries the row data part (`canopyx-data.js`) whenever a grid ends up with compact rows, in single-file fragments
and pages, once per `CanopyHtmlDocument`. Set `Format` to choose yourself:

| `CanopyRowDataOptions.Format` | Single-file fragments and pages | Bundles (`SaveBundle`) |
| --- | --- | --- |
| `Auto` (default) | By the rules above | Compact row data files, compressed above 5 MiB of JSON |
| `Objects` | Row objects | Not available (a bundle writes its rows as files) |
| `Compact` | Compact row data | Compact row data files |
| `CompactGzip` | Compressed row data | Compressed row data files |

```csharp
grid.Save("inventory.html");                                   // chosen from the rows
grid.Save("inventory-objects.html", new CanopyHtmlOptions { RowData = new CanopyRowDataOptions { Format = CanopyRowFormat.Objects } });
```

## Mount views when they come into view

A report with many sections, most of them in tabs, accordions or below the fold, used to parse and build every grid when it loaded, including the hidden ones. With `MountWhenVisible`, a fragment is marked `data-cx-mount="visible"` and the runtime leaves it alone until it comes within half a window height of the visible area. Until then its configuration and rows are not even parsed.

```csharp
var document = new CanopyHtmlDocument();
foreach (var section in sections) {
    html.Append(section.Grid.ToHtmlFragment(new CanopyHtmlOptions { Document = document, MountWhenVisible = true, Height = "420px" }));
}
```

- A hidden tab (`display: none`, the `hidden` attribute), a closed `<details>` or a collapsed panel mounts its views when it opens; the runtime watches with an `IntersectionObserver`, so the host calls nothing.
- Printing mounts every view still waiting (`beforeprint`). Those views build while printing starts, and a browser may print them before their rows have rendered; for print-ready output, mount them first with `CanopyX.mount(host)`, or keep a static fallback.
- A script that needs a waiting view's API mounts it at once with `CanopyX.mount(host)`, giving the host element itself. Until it mounts, `host.canopyx` is undefined, and `CanopyX.configure(viewId, …)` can still register its options.
- Give such hosts a height (`Height`), so the page does not jump when they mount.
- `AutoMount = false` (`data-cx-mount="manual"`) still wins: the host mounts those itself.
- `CanopyX.mount(root)` returns the views it mounted at once; views below `root` that wait to be shown are not among them. Given a fragment itself as `root`, it mounts that fragment only.

A host's script-free `<noscript>` fallback (`CanopyStaticHtml`) works as before; see [the static fallback](#the-static-fallback).

## Compact row data

Compact row data (`rowData` in the [protocol](data-protocol.md#row-data)) writes each row as an array of its cells in column order instead of an object that repeats every column id, in chunks of 5,000 rows by default. The page carries the small row data part (`canopyx-data.js`), which decodes the chunks after the grid has drawn its toolbar and header, one chunk per task, so the page stays responsive while it loads.

```csharp
grid.Save("inventory.html", new CanopyHtmlOptions { RowData = new CanopyRowDataOptions { Format = CanopyRowFormat.Compact, ChunkSize = 2000 } });
grid.Save("inventory-small.html", new CanopyHtmlOptions { RowData = new CanopyRowDataOptions { Format = CanopyRowFormat.CompactGzip } });
```

- The writer puts the rows in identity order, which is the order the grid shows when no sort applies, and says so (`ordered`). The grid then shows the first rows as soon as the first chunk is decoded. The order of rows in the data never changes what the grid shows.
- A sort, a filter, a search, or a reporting grid's totals and groups wait until every chunk is decoded; the grid shows its loading state meanwhile.
- `ChunkSize` (100 to 100,000) trades responsiveness for overhead: smaller chunks show the first rows sooner and keep each task short; larger ones finish slightly sooner.
- `CompactGzip` makes the file several times smaller. The browser inflates every chunk with `DecompressionStream`, which every current browser has; an older browser shows an error instead of rows.
- A chunk that fails to load or decode fails the query that waited for it; the grid's Retry (or `retry()`) starts the decoding over. Decoding is local work, so the request deadline (`requestTimeoutMs`, 30 seconds by default for host sources) does not apply to it unless the host sets one.
- `CanopyGridRowData` gives the same output to hosts that write pages themselves: `ToJson()` for the grid document, `GetChunk(index)` for each chunk script.
- Decoding stays on the main thread, in short tasks: within a chunk, rows are expanded and checked in slices of about 8 ms that yield to the page, so even at 4x CPU no decoding task reaches 50 ms. Repeated short texts in a column (a domain, a department, a state) share one string while the column has few distinct values, which takes about 15% off the heap of a directory-shaped grid. A worker would parse off the main thread, but handing a million parsed rows back to the page costs a copy of about the same size as parsing them, and pages opened from `file://` cannot start a worker from a script file (only from a blob); chunks that yield between them keep the page responsive without either cost.

## Grid bundles

`CanopyDataGridView.SaveBundle(directory)` writes `index.html`, the runtime and its parts under `assets/`, and the rows as compact row data in sidecar scripts (`data/<view folder>/rows/<n>.js`). The page itself is a few kilobytes whatever the number of rows; the runtime loads the first chunk, paints, and loads the next chunks one after another. Script files work from `file://`, a file share, a web server or SharePoint alike, because browsers block `fetch` of local files but not scripts. Republish the page and its data together, into a folder of their own.

```csharp
var result = grid.SaveBundle(@"\\reports\inventory", new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External,
    RowData = new CanopyRowDataOptions { Format = CanopyRowFormat.CompactGzip } });
Console.WriteLine($"{result.FileCount} files, {result.TotalBytes:N0} bytes, largest {result.LargestFileBytes:N0}");
```

## The static fallback

A fragment never writes its rows twice: the configuration (or the row data chunks) is the only copy the live grid reads. A host that adds a script-free fallback (`CanopyStaticHtml.RenderGrid` inside `<noscript>`, for mail clients and readers without script) writes a second, bounded copy: the fallback shows at most `CanopyStaticHtmlOptions.MaxRows` rows (1,000 by default) and a note with the number left out. For a large grid, keep that limit small (for example 100) and point `FullReportUrl` at the full report, so the fallback adds kilobytes rather than a second dataset. Printing uses the live grid; views still waiting to be shown mount as printing starts (see above).

## What the runtime does for every grid

These apply without any option:

- A view the runtime parsed from the page is used as it is; only a view a host script passes to `createDataGrid` is copied first. A large inline dataset is parsed once instead of twice.
- Sorting reads each row's sort keys once per sort instead of in every comparison (a date key parses its text), which makes the first sort of a large dataset many times faster. Groupable grids and grids with plugins sort the same way; only a column with a plugin comparator or alternate sort fields compares rows.
- Search tests an ASCII term against the raw cell text with a case-insensitive pattern instead of folding a copy of every cell; the pattern also lists the few characters that fold onto ASCII letters, so it finds exactly what folding finds. Other terms fold the cells with the full table.
- Over more than 20,000 inline rows, search and filters run in slices of about 10 ms that yield to the page, so typing and scrolling keep their turn, and a newer query stops an older one between slices. Regex searches keep their single 50 ms budget and stay in one pass.
- Rows are virtual: a million rows never become a million elements, and logical heights above the browser's limit use a bounded scrollbar. Columns are not virtualised; every visible column of the rows in view is drawn, which is cheap for the column counts of reports.

## Measured numbers

The load benchmark (`tests/browser/bench/load-benchmark.mjs`) opens synthetic pages that `tests/browser/bench/load-fixture.mjs` writes: flat grids of 10,000, 100,000 and 1,000,000 rows with twelve columns, a tree of 101,010 nodes, and a report with 24 grids and two trees, most of them in hidden tabs or below the fold. Each case runs in a fresh browser (Edge, 1440 x 900), at normal speed and with the CPU slowed four times, median of 5 runs.

All times run from navigation start. *First rows* is the frame after the first data row is in the DOM; *all rows* is when compact row data has finished decoding (row objects are complete at their first rows); *longest task* is the longest main-thread task before the page settles, which is how long the page can ignore a click; *heap* is the JavaScript heap after a forced garbage collection once all rows are in; *first sort* sorts by a date column and *first search* runs a quick search over the complete rows, each until painted. "Before" is the runtime this work started from, where a bundle of a flat grid could only place the runtime in files and kept the rows inline.

**A grid of 100,000 rows, CPU slowed four times**

| Delivery | Size | First rows | All rows | Longest task | Heap | First sort | First search |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Before: row objects, single file | 30.7 MB | 2,848 ms | 2,848 ms | 2,232 ms | 52 MB | 4,394 ms | 1,705 ms |
| Row objects, single file | 30.7 MB | 2,652 ms | 2,652 ms | 2,000 ms | 28 MB | 832 ms | 1,211 ms |
| Compact row data, single file | 19.4 MB | 1,427 ms | 2,748 ms | 594 ms | 29 MB | 908 ms | 1,605 ms |
| Compressed row data, single file | 6.3 MB | 1,162 ms | 3,171 ms | 306 ms | 29 MB | 783 ms | 1,283 ms |
| Before: bundle with inline rows | 30.8 MB | 3,353 ms | 3,353 ms | 2,768 ms | 52 MB | 5,502 ms | 1,668 ms |
| Bundle with row files | 19.5 MB | 723 ms | 3,010 ms | 322 ms | 29 MB | 726 ms | 1,172 ms |
| Hosted source (local mock) | 0.5 MB | 989 ms | - | 372 ms | 2 MB | 436 ms | 452 ms |

**A grid of 1,000,000 rows, CPU slowed four times**

| Delivery | Size | First rows | All rows | Longest task | Heap | First sort | First search |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Before: row objects, single file | 303.4 MB | 31,732 ms | 31,732 ms | 27,770 ms | 503 MB | 51,007 ms | 9,924 ms |
| Row objects, single file | 303.4 MB | 28,619 ms | 28,619 ms | 19,612 ms | 265 MB | 10,059 ms | 11,317 ms |
| Compact row data, single file | 190.3 MB | 3,905 ms | 21,877 ms | 672 ms | 269 MB | 7,471 ms | 11,638 ms |
| Compressed row data, single file | 58.6 MB | 1,942 ms | 25,218 ms | 458 ms | 269 MB | 8,050 ms | 10,310 ms |
| Before: bundle with inline rows | 303.5 MB | 24,956 ms | 24,956 ms | 20,954 ms | 503 MB | 46,797 ms | 9,664 ms |
| Bundle with row files | 190.4 MB | 744 ms | 23,943 ms | 314 ms | 269 MB | 7,019 ms | 8,175 ms |
| Hosted source (local mock) | 0.5 MB | 820 ms | - | 321 ms | 2 MB | 343 ms | 313 ms |

At normal speed the same million rows show their first rows in 165 ms (bundle), 369 ms (compressed) or 697 ms (compact) instead of 6.5 s, and are all decoded in about 3.4 s (compact or compressed) or 4.8 s (bundle, which also reads 200 files). A grid of 10,000 rows is quick in every delivery (about 0.2 s at normal speed, 0.8 to 1.0 s at 4x); compression still makes its file three times smaller.

**A report with 24 grids (30,750 rows) and two trees, CPU slowed four times**

| Mounting | Size | First rows | Interactive | Longest task | Heap | Views mounted at load | Open a hidden tab | Scroll to the end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Before: every view at load | 10.6 MB | 2,456 ms | 3,165 ms | 2,045 ms | 22 MB | 26 | 952 ms | 64 ms |
| When visible | 10.6 MB | 1,490 ms | 1,806 ms | 840 ms | 4 MB | 2 | 1,086 ms | 1,238 ms |
| When visible, compact row data | 7.1 MB | 1,277 ms | 1,404 ms | 689 ms | 4 MB | 2 | 1,673 ms | 1,198 ms |

Mounting when visible moves the cost of a hidden section to the moment it is opened or scrolled to, where it is paid for that section only. At normal speed the report is interactive in 339 ms instead of 480 ms.

What does not change: trees, a report that mounts every view at load and hosted grids take the same time as before. Measured in alternating rounds on the same machine (5 runs each, CPU slowed four times), the inline tree of 101,010 nodes showed its first rows in 2,123 and 2,039 ms before and 2,085 and 2,260 ms after, the tree bundle in 845 and 692 ms before and 761 and 464 ms after, and the report that mounts every view in 3,831 and 3,723 ms before and 3,826 and 3,312 ms after. Timings on a shared workstation drift by tens of percent over hours, so compare within one run.

Search still scans every row, in slices that keep the page responsive. For datasets beyond that, a hosted source answers each query from the host.

## Directory-sized reports

The scale benchmark writes pages shaped like directory reports through the regular writers and their default choices, at
50, 500, 5,000, 50,000 and 500,000 rows or nodes: a user inventory (20 columns, readers can group it) as a single file and as a
bundle, a computer inventory (14 columns), wide user inventories (100 and 150 columns, at 5,000 and 50,000 rows), a group
membership tree as a single file and as a bundle, a policy by server matrix (up to 5,000 by 200, the matrix's cell limit) and a
change list (one change per ten objects, up to its 10,000 items). It measures each in a fresh Chromium (1440 x 900), median of
three runs: the bytes of the page and its files, *first rows* (navigation start to the frame after the view shows a row), *all
rows* (compact row data decoded), the longest main-thread task until then, sorting by a date column, filtering, grouping (a
tree: opening its largest group, up to 5,000 members), a quick search, the frame rate while wheel-scrolling for about two
seconds, and the JavaScript heap after load.

At 50 and 500 every view shows its first rows within about 0.1 s and answers every operation within 0.05 s. The tables below
are the larger tiers on an Apple M5 Max, in milliseconds unless stated; `a → b` is before → after the changes that came with the
benchmark (keys read once per sort in groupable grids, first rows before every chunk in reporting grids that total nothing),
shown where they differ by more than 15%.

**5,000 rows or nodes**

| View | Size | First rows | All rows | Longest task | Sort | Filter | Group / expand | Search | Scroll fps | Heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| users-5000 | 3.8 MB | 122 | 116 | 70 | 27 | 32 | 42 | 43 | 60 | 6 MB |
| users-5000-bundle | 4.6 MB | 129 | 125 | 0 | 27 | 32 | 44 | 44 | 61 | 6 MB |
| computers-5000 | 2.9 MB | 119 | 102 | 0 | 28 | 32 | 32 | 32 | 60 | 5 MB |
| users-wide100-5000 | 11.7 MB | 287 | 264 | 181 | 101 | 85 | 151 | 148 | 50 | 9 MB |
| users-wide150-5000 | 16.8 MB | 417 | 381 | 287 | 125 | 128 | 227 | 224 | 41 | 24 MB |
| groups-5000 | 1.1 MB | 80 | 62 | 0 | 32 | – | 6 → 30 | 31 | 60 | 3 MB |
| groups-5000-bundle | 2.0 MB | 65 | 48 | 0 | 33 | – | 18 | 31 | 60 | 2 MB |
| matrix-5000 | 812 KB | 66 | 54 | 0 | 32 | 33 | – | 33 | 60 | 2 MB |
| changes-5000 | 841 KB | 74 | 61 | 0 | – | 31 | – | 33 | 60 | 2 MB |

**50,000 rows or nodes**

| View | Size | First rows | All rows | Longest task | Sort | Filter | Group / expand | Search | Scroll fps | Heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| users-50000 | 4.8 MB | 264 → 152 | 249 | 0 | 170 → 46 | 31 | 70 | 77 | 61 | 39 MB |
| users-50000-bundle | 6.6 MB | 235 → 152 | 234 | 0 | 170 → 45 | 30 | 69 | 76 | 61 | 39 MB |
| computers-50000 | 3.7 MB | 194 → 121 | 192 | 0 | 158 → 37 | 25 | 51 | 59 | 55 | 22 MB |
| users-wide100-50000 | 22.0 MB | 855 → 348 | 793 | 89 → 141 | 259 → 123 | 107 | 210 | 259 | 46 | 185 MB |
| users-wide150-50000 | 32.1 MB | 1,204 → 473 | 1,085 | 133 → 204 | 300 → 164 | 150 | 291 | 330 | 41 | 192 MB |
| groups-50000 | 6.5 MB | 97 | 95 | 0 | 48 | – | 24 | 49 | 60 | 9 MB |
| groups-50000-bundle | 9.9 MB | 80 | 52 | 0 | 34 | – | 18 | 30 | 60 | 2 MB |
| matrix-50000 | 1.0 MB | 75 | 61 | 0 | 30 | 32 | – | 33 | 60 | 3 MB |
| changes-50000 | 1.4 MB | 80 | 66 | 0 | – | 32 | – | 32 | 60 | 4 MB |

**500,000 rows or nodes**

| View | Size | First rows | All rows | Longest task | Sort | Filter | Group / expand | Search | Scroll fps | Heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| users-500000 | 39.8 MB | 1,515 → 222 | 1,438 | 0 | 2,410 → 301 | 87 | 370 | 438 | 60 | 370 MB |
| users-500000-bundle | 41.6 MB | 1,597 → 132 | 1,397 | 0 | 2,582 → 296 | 90 | 360 | 432 | 61 | 370 MB |
| computers-500000 | 27.9 MB | 1,165 → 148 | 1,013 | 0 | 2,458 → 263 | 73 | 236 | 300 | 61 | 200 MB |
| groups-500000 | 60.7 MB | 363 | 351 | 200 | 56 | – | 14 | 189 → 159 | 60 | 67 MB |
| groups-500000-bundle | 87.1 MB | 65 | 46 | 0 | 34 | – | 19 | 30 | 60 | 2 MB |
| matrix-500000 | 1.9 MB | 86 | 72 | 0 | 30 | 32 | – | 34 | 60 | 5 MB |
| changes-500000 | 2.1 MB | 100 | 91 | 0 | – | 31 | – | 33 | 61 | 6 MB |

**50,000 rows, 4x CPU**

| View | Size | First rows | All rows | Longest task | Sort | Filter | Group / expand | Search | Scroll fps | Heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| users-50000 | 4.8 MB | 1,216 → 597 | 1,015 | 175 | 850 → 182 | 126 | 292 | 323 | 41 | 39 MB |
| users-wide150-50000 | 32.1 MB | 5,623 → 2,081 | 5,572 → 4,690 | 606 → 959 | 1,391 → 704 | 635 | 1,243 | 1,441 | 20 | 192 MB |

**500,000 rows or nodes, 4x CPU**

| View | Size | First rows | All rows | Longest task | Sort | Filter | Group / expand | Search | Scroll fps | Heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| users-500000 | 39.8 MB | 7,718 → 833 | 7,704 → 6,061 | 171 | 11,465 → 1,279 | 489 → 385 | 1,645 | 1,853 | 49 | 370 MB |
| users-500000-bundle | 41.6 MB | 8,152 → 629 | 8,132 → 6,236 | 178 | 11,453 → 1,309 | 376 | 1,624 | 1,856 | 52 | 370 MB |
| computers-500000 | 27.9 MB | 5,837 → 669 | 5,826 → 4,502 | 145 → 118 | 10,757 → 1,085 | 319 | 823 → 971 | 1,258 | 58 | 200 MB |
| groups-500000 | 60.7 MB | 1,583 | 1,566 | 920 | 238 | – | 34 | 604 | 60 | 67 MB |
| groups-500000-bundle | 87.1 MB | 215 | 202 | 0 | 59 | – | 35 | 54 | 60 | 2 MB |
| matrix-500000 | 1.9 MB | 357 | 317 | 169 | 119 | 119 | – | 108 | 60 | 5 MB |
| changes-500000 | 2.1 MB | 357 | 308 | 143 | – | 94 | – | 74 | 61 | 6 MB |

Decoding in slices, sliced search and shared strings changed the 500,000-row user inventory as below (Apple M5 Max, median of
three runs, single file / bundle; *task* is the longest main-thread task during that step):

| CPU | All rows | Longest decoding task | Search | Longest search task | Filter task | Heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1x | 1,379 → 1,496 / 1,325 → 1,403 | 0 → 0 | 429 → 256 / 423 → 249 | 425 → 0 / 418 → 0 | 79 → 0 | 370 → 314 MB |
| 4x | 5,760 → 6,526 / 5,722 → 5,747 | 72 → 0 / 65 → 0 | 1,791 → 1,095 / 1,800 → 1,066 | 1,773 → 89 / 1,782 → 82 | 356 → 91 | 370 → 314 MB |

Decoding all rows of the single file takes up to an eighth longer because it yields more often and shares strings; the bundle barely changes, and the first rows show as before.
The tables above were measured before these changes.

What these numbers mean for a report:

- **Flat grids hold 500,000 rows in one file.** The writer's default (compressed row data above 25,000 rows) keeps a 500,000-row
  user inventory at 40 MB; its first rows show in 0.1 to 0.2 s (0.6 to 0.8 s at 4x), the rest decodes in short tasks, and sort,
  filter, group and search take 0.1 to 0.4 s (0.4 to 1.2 s at 4x), and search and filters never hold the page for more than
  about 0.1 s at 4x. The browser holds about 315 MB. A grid bundle is not lighter:
  it reads every row too, so it helps only where one file is not allowed. Beyond this, or for data that changes, use a hosted
  source, which pages on the host.
- **Trees bundle well.** A 500,000-node tree is 61 MB inline and shows its first rows in 0.4 s (1.6 s at 4x, with a 0.9 s task
  while it parses); as a bundle it shows them in 0.07 s (0.2 s at 4x) and holds 2 MB, because branches load when they open. Up to
  about 50,000 nodes the inline page is as quick.
- **Matrices and change lists stay small.** Their limits (`CanopyMatrix.MaxCells`, `CanopyChangeList.MaxItems`) bound them, and
  every tier stays under 0.4 s at 4x.
- **Wide grids scroll slower, not stall.** 100 columns scroll at 46 to 57 fps and 150 columns at about 41 (20 at 4x), without
  frames over 50 ms at normal speed. Flat grids draw every visible column of the rows in view; column windowing
  ([TODO](../TODO.md)) is the next step if a report needs more than about 100 visible columns.
- **No worker.** Sorting, filtering, grouping and searching stay on the main thread: at 500,000 rows they take 0.1 to 0.4 s at
  normal speed. A worker would need its own copy of the rows (another 370 MB at that size), and pages opened from `file://` or
  under a strict Content Security Policy can start one only from a blob.
- **The .NET model.** A plain cell takes 32 bytes in .NET (its text, tooltip, tone, badges, sort key and structured value take
  room only once set), so a 500,000 by 20 grid model is about 1.4 GB and writing it adds about 1 GB of short-lived strings.

```powershell
dotnet run --project CanopyX.Examples -c Release -- D:\Scratch\scale --scale                 # every tier, about 420 MB
cd tests/browser
node bench/scale-benchmark.mjs --fixtures D:\Scratch\scale\scale --runs 3 --label after
node bench/scale-benchmark.mjs --fixtures D:\Scratch\scale\scale --runs 1 --cpu 4 --cases users-500000,groups-500000
```

`--tiers 50000,500000` limits the tiers the examples app writes; `--cases` picks pages by name. The opt-in
`scale-performance.spec.mjs` keeps budgets for a 500,000-row groupable grid (sort 1.5 s, filter 1 s, group and search 2 s, at
normal speed in Chromium), `scale-responsiveness.spec.mjs` writes the 500,000-user page and keeps every decoding and search task
under 250 ms at 4x CPU, and the `Benchmark` category checks the size of a plain cell.

## Opt-in load benchmarks

`tests/browser/specs/large-data-performance.spec.mjs` retains these measurement targets with the CPU slowed four times (median of three cold loads, Chromium). Run it through the [explicit benchmark selection](testing.md#run-measurements-explicitly); shared correctness CI keeps the data and lazy-mount contracts without timing ceilings.

| Check | Budget | Measured |
| --- | --- | --- |
| First rows of `large/grid-100k.html` (written with the default format: compressed row data, 6.5 MB) | 4,000 ms | about 1.2 to 1.7 s |
| First rows of `large/grid-100k-objects.html` (row objects, 30.8 MB) | 8,000 ms | about 2.5 s |
| `large/report.html` (24 grids that mount when visible): its two visible grids ready | 6,000 ms | about 2.0 s |
| `large/report.html`: views mounted at that moment | exactly 2 | 2 |

Timing targets help compare qualified runs on a known host. The deterministic size budgets of the runtime entry points (gzip) remain required, and the row data part has a 2.5 KiB guard (about 2 KiB).

The examples it opens are written by `CanopyX.Examples` into `large/`: `grid-100k.html` (the default format, which chooses compressed row data for 100,000 rows), `grid-100k-objects.html` (row objects, asked for explicitly), `grid-compact.html` and `bundle-compact/` (the same grid at 500 rows as compressed row data, for the accessibility sweep), `bundle/` (gzip row data in sidecar files) and `report.html` (24 grids that mount when visible). `large-data.spec.mjs` checks their behaviour: mounting on view, tab, print and request; identical results from compact and object rows, and the format the default chose; first windows before the last chunk; and failures for invalid row data.

## Reproducing the measurements

```powershell
cd tests/browser
node bench/load-fixture.mjs --out D:\Scratch\load                 # every case, about 2 GB at 1,000,000 rows
node bench/load-benchmark.mjs --fixtures D:\Scratch\load --runs 5 --cpu 1,4 --label after
node bench/load-benchmark.mjs --fixtures D:\Scratch\load --cases grid-100000-compact,report-lazy --runs 3 --cpu 4
```

`--rows 10000,100000` limits the sizes, `--modes single,compact,gzip,bundle,remote` the page shapes, and `--reports single,lazy,lazy-compact` the report pages. The remote cases are served by the benchmark itself, from a mock endpoint that filters, sorts and pages rows in memory.
