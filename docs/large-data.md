# Large reports

CanopyX keeps the rendered DOM small at any size: only the rows in view, a small overscan and the focused row exist as elements. What a large report costs is everything before that: the bytes of the page, parsing the embedded data, building every grid on the page, and the first query over the complete rows. This guide describes the choices that keep those costs down, so the first rows show fast, the rest loads lazily and memory stays bounded, and the numbers measured for each.

## Choosing a delivery

| Delivery | What the page holds | Best for |
| --- | --- | --- |
| Single file, row objects (the default) | The runtime, and each grid's rows as objects in its configuration | Small and medium grids; reports that are mailed or attached as one file |
| Single file, compact row data (`RowData`) | Each grid's rows as arrays in column order, in chunks inside its host element | Large grids that must stay one file: smaller, and the first rows show after the first chunk |
| Single file, compressed row data (`RowData` with `Gzip`) | The same chunks, gzip-compressed and base64-encoded | The smallest single file; decoding costs a little more while loading |
| Bundle (`SaveHtmlBundle`) | A small `index.html`, the runtime as files, and the rows in sidecar files | File shares and web servers; the page opens at once and loads rows chunk by chunk, also from `file://` |
| Hosted source | Only the definition; the host's endpoint answers each query | Datasets too large for the browser, or that change; the host filters, sorts and pages |

Mounting when visible (`MountWhenVisible`) combines with every delivery: a page with many views mounts only those in view, and the others when they are scrolled to, their tab or panel opens, the page prints, or a script asks for them.

Trees keep their own choices: inline nodes for small trees, a bundle for large ones (see [architecture.md](architecture.md#data-flow)).

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

`CanopyHtmlOptions.RowData` writes an inline grid's rows as compact row data (`rowData` in the [protocol](data-protocol.md#row-data)): each row an array of its cells in column order instead of an object that repeats every column id, in chunks of 5,000 rows by default. The page carries the small row data part (`canopyx-data.js`), which decodes the chunks after the grid has drawn its toolbar and header, one chunk per task, so the page stays responsive while it loads.

```csharp
grid.SaveHtmlPage("inventory.html", new CanopyHtmlOptions { RowData = new CanopyRowDataOptions() });
grid.SaveHtmlPage("inventory-small.html", new CanopyHtmlOptions { RowData = new CanopyRowDataOptions { Compression = CanopyRowCompression.Gzip } });
```

- The writer puts the rows in identity order, which is the order the grid shows when no sort applies, and says so (`ordered`). The grid then shows the first rows as soon as the first chunk is decoded. The order of rows in the data never changes what the grid shows.
- A sort, a filter, a search, or a reporting grid's totals and groups wait until every chunk is decoded; the grid shows its loading state meanwhile.
- `ChunkSize` (100 to 100,000) trades responsiveness for overhead: smaller chunks show the first rows sooner and keep each task short; larger ones finish slightly sooner.
- `Gzip` makes the file several times smaller. The browser inflates every chunk with `DecompressionStream`, which every current browser has; an older browser shows an error instead of rows.
- A chunk that fails to load or decode fails the query that waited for it; the grid's Retry (or `retry()`) starts the decoding over. Decoding is local work, so the request deadline (`requestTimeoutMs`, 30 seconds by default for host sources) does not apply to it unless the host sets one.
- `CanopyGridRowData` gives the same output to hosts that write pages themselves: `ToJson()` for the grid document, `GetChunk(index)` for each chunk script.
- Decoding stays on the main thread, in short tasks. A worker would parse off the main thread, but handing a million parsed rows back to the page costs a copy of about the same size as parsing them, and pages opened from `file://` cannot start a worker from a script file (only from a blob); chunks that yield between them keep the page responsive without either cost.

## Grid bundles

`CanopyDataGridView.SaveHtmlBundle(directory)` writes `index.html`, the runtime and its parts under `assets/`, and the rows as compact row data in sidecar scripts (`data/<view folder>/rows/<n>.js`). The page itself is a few kilobytes whatever the number of rows; the runtime loads the first chunk, paints, and loads the next chunks one after another. Script files work from `file://`, a file share, a web server or SharePoint alike, because browsers block `fetch` of local files but not scripts. Republish the page and its data together, into a folder of their own.

```csharp
var result = grid.SaveHtmlBundle(@"\\reports\inventory", new CanopyHtmlOptions { AssetMode = CanopyAssetMode.External,
    RowData = new CanopyRowDataOptions { Compression = CanopyRowCompression.Gzip } });
Console.WriteLine($"{result.FileCount} files, {result.TotalBytes:N0} bytes, largest {result.LargestFileBytes:N0}");
```

## The static fallback

A fragment never writes its rows twice: the configuration (or the row data chunks) is the only copy the live grid reads. A host that adds a script-free fallback (`CanopyStaticHtml.RenderGrid` inside `<noscript>`, for mail clients and readers without script) writes a second, bounded copy: the fallback shows at most `CanopyStaticHtmlOptions.MaxRows` rows (1,000 by default) and a note with the number left out. For a large grid, keep that limit small (for example 100) and point `FullReportUrl` at the full report, so the fallback adds kilobytes rather than a second dataset. Printing uses the live grid; views still waiting to be shown mount as printing starts (see above).

## What the runtime does for every grid

These apply without any option:

- A view the runtime parsed from the page is used as it is; only a view a host script passes to `createDataGrid` is copied first. A large inline dataset is parsed once instead of twice.
- Sorting reads each row's sort keys once per sort instead of in every comparison (a date key parses its text), which makes the first sort of a large dataset many times faster.
- Search and filters fold ASCII text with the engine's own lowercase conversion, and use the full folding table only for other characters.
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

Search still scans every row: a quick search over a million rows takes about 1.4 s at normal speed. For datasets beyond that, a hosted source answers each query from the host.

## Opt-in load benchmarks

`tests/browser/specs/large-data-performance.spec.mjs` retains these measurement targets with the CPU slowed four times (median of three cold loads, Chromium). Run it through the [explicit benchmark selection](testing.md#run-measurements-explicitly); shared correctness CI keeps the data and lazy-mount contracts without timing ceilings.

| Check | Budget | Measured |
| --- | --- | --- |
| First rows of `large/grid-100k.html` (compact row data, 19.5 MB) | 4,000 ms | about 1.0 s |
| First rows of `large/grid-100k-objects.html` (row objects, 30.8 MB) | 8,000 ms | about 2.5 s |
| `large/report.html` (24 grids that mount when visible): its two visible grids ready | 6,000 ms | about 2.0 s |
| `large/report.html`: views mounted at that moment | exactly 2 | 2 |

Timing targets help compare qualified runs on a known host. The deterministic size budgets of the runtime entry points (gzip) remain required, and the row data part has a 2.5 KiB guard (about 2 KiB).

The examples it opens are written by `CanopyX.Examples` into `large/`: `grid-100k.html` (compact row data), `grid-100k-objects.html` (row objects), `bundle/` (gzip row data in sidecar files) and `report.html` (24 grids that mount when visible). `large-data.spec.mjs` checks their behaviour: mounting on view, tab, print and request; identical results from compact and object rows; first windows before the last chunk; and failures for invalid row data.

## Reproducing the measurements

```powershell
cd tests/browser
node bench/load-fixture.mjs --out D:\Scratch\load                 # every case, about 2 GB at 1,000,000 rows
node bench/load-benchmark.mjs --fixtures D:\Scratch\load --runs 5 --cpu 1,4 --label after
node bench/load-benchmark.mjs --fixtures D:\Scratch\load --cases grid-100000-compact,report-lazy --runs 3 --cpu 4
```

`--rows 10000,100000` limits the sizes, `--modes single,compact,gzip,bundle,remote` the page shapes, and `--reports single,lazy,lazy-compact` the report pages. The remote cases are served by the benchmark itself, from a mock endpoint that filters, sorts and pages rows in memory.
