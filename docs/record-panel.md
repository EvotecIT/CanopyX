# Record panel

A row shows a handful of columns; the record behind it often has fifty fields or more, lists, nested objects, related
records and a history. The record panel is the record drawer of a flat grid or a tree grown to show all of that: tabs and
collapsible sections under a pinned summary, structured values, nested collections with their own sorting and paging,
links between records with a back stack, timelines and before/after changes, record deep links, and copy, print and export
of one record. Details can load when the drawer opens, so a large single-file report does not embed every field of every
row.

The panel generalises the existing drawer. A view without a record panel keeps its plain drawer, which now also keeps each
field's tone, tooltip, badges, presenter and host or plugin renderer, and leaves out columns with `drawer: false`. The panel
ships as the lazy `record-panel` part (`canopyx-record-panel.js` and `.css`), which a view loads only when it uses it.

## A first record panel

```csharp
var view = new CanopyDataGridView("certificates", "Certificates") { RowAction = CanopyGridRowAction.Details };
view.Columns.Add(new CanopyColumn("cn", "Common name") { Sortable = true });
view.Columns.Add(new CanopyColumn("status", "Status") { Presenter = CanopyGridPresenter.State() });
view.Columns.Add(new CanopyColumn("names", "Alternative names") { Presenter = CanopyGridPresenter.Structured(CanopyGridStructuredDisplay.Chips, 2) });
view.Columns.Add(new CanopyColumn("serial", "Serial") { Hidden = true, ShowInDrawer = false });

var record = view.Record = new CanopyRecordPanel { DeepLink = true, HeaderStatus = "status" };
record.HeaderFacts.Add("cn");
record.Fields.Add(new CanopyColumn("thumbprint", "Thumbprint"));
record.Fields.Add(new CanopyColumn("contacts", "Contacts"));
record.Fields.Add(new CanopyColumn("history", "Timeline"));

var identity = new CanopyRecordSection("identity", "Identity");
identity.Fields.Add("thumbprint"); identity.Fields.Add("names");
record.Sections.Add(identity);
var people = new CanopyRecordSection("people", "People");
people.Fields.Add("contacts");
record.Sections.Add(people);

var row = new CanopyGridRow("cert-1");
row.Cells["cn"] = "app.example.com";
row.Cells["status"] = new CanopyCell("Valid") { Tone = CanopyTone.Success };
row.Cells["names"] = CanopyCell.List("app.example.com", "www.app.example.com");
row.Fields["thumbprint"] = "A1B2…";
row.Fields["history"] = CanopyCell.Timeline(new[] { new CanopyRecordEvent(DateTime.UtcNow, "Certificate issued") { Kind = "Issued", Tone = CanopyTone.Success } });
view.Rows.Add(row);
```

The same definition in a view document:

```json
{ "record": {
    "fields": [{ "id": "thumbprint", "title": "Thumbprint" }, { "id": "contacts", "title": "Contacts" }, { "id": "history", "title": "Timeline" }],
    "header": { "status": "status", "facts": ["cn"] },
    "sections": [{ "id": "identity", "label": "Identity", "fields": ["thumbprint", "names"] }, { "id": "people", "label": "People", "fields": ["contacts"] }],
    "deepLink": true } }
```

`CertificateInventoryExample` in `CanopyX.Examples` builds the complete example: a certificate inventory whose rows show
eight columns and whose records have about sixty fields in five tabs, contacts by role, related certificates with "Open all
in grid", a timeline with changes, a days-left sparkline, a drawer section a plugin draws, deep links and print. It writes
`certificate-inventory.html`, `certificate-sidecar/index.html` (details in record packs) and `certificate-tree.html` (the
tree drawer).

## Fields

The panel shows the view's columns and its record fields:

- **Columns** keep everything their cells show in the grid: the presenter, a host or plugin renderer, or the text with its
  tone, tooltip and badges. The identity column titles the drawer, with its secondary text as the subtitle; it is not
  repeated in the body unless a section lists it. `CanopyColumn.ShowInDrawer = false` (`drawer: false`) keeps a column out
  of the drawer, as an internal key or a value the summary shows.
- **Record fields** (`CanopyRecordPanel.Fields`, `record.fields`) are values the drawer shows that are not grid columns: an
  id, a title, a kind, a presenter (flat grids), wrapping and a section label. Rows carry their values in
  `CanopyGridRow.Fields` (`fields`), nodes in `CanopyNode.Fields`, or a record source loads them (see below). Record fields
  cost the grid nothing: they never join queries, search, sorting, the Columns menu, exports or saved views.

Record field ids differ from column ids. Writers and the browser check that sections, tabs and the summary name declared
fields.

## Structured values

Any cell, column or record field, can hold one structured value, and any value can link to a record:

| Member | C# | Panel | Grid cell (structured presenter) |
| --- | --- | --- | --- |
| `items` | `CanopyCell.Items`, `CanopyCell.List(...)` | Chips, each with its own tone, tooltip or link; "Show all N" past 24 | The first chips, then "+N" |
| `fields` | `CanopyCell.Fields`, `CanopyCell.Object(...)` | A nested property list; values nest | The first value, then "+N" |
| `records` | `CanopyCell.Records`, `CanopyCell.Collection(...)` | A nested grid or tree (see Collections) | A count |
| `events` | `CanopyCell.Events`, `CanopyCell.Timeline(...)` | A timeline grouped by day | A count |
| `changes` | `CanopyCell.Changes`, `CanopyCell.Diff(...)` | A before/after table | A count |
| `ref` | `CanopyCell.Ref`, `CanopyCell.Link(text, id, view)` | A link that opens the record | The text |

Structured values nest up to eight levels (an object in a collection in an object). Search, sorting, filters and exports read
the cell's raw `value` as always: `CanopyCell.List` sets it to the items joined, so a list column searches and exports its
items; give other structured cells in grid columns a value or a text yourself (for example the record count in a number
column, `new CanopyCell(12) { Records = list }`).

`CanopyGridPresenter.Structured(display, limit, countText)` (`{ "kind": "structured" }`) summarises a structured value in a
grid cell: `Count` ("4 names" with `countText: "{count} names"`, default "{count} items"), `Chips` (the first `limit`
items, then "+N") or `First` (the first item, then "+N"). Without a display, lists show chips, objects their first value and
the rest a count; a cell's own text wins. The part loads with the grid's first query when a column uses it.

## Layout

- **Sections.** Without `Sections`, fields group by their section label (`CanopyColumn.Section`), as in the plain drawer.
  Declared sections (`CanopyRecordSection`) take the fields they list, in order, and nest up to three levels; a field shows
  in the first section that lists it. A trailing section, "Other fields", keeps every field no section lists, so nothing a
  record carries is left out. A section's heading is a button with `aria-expanded`; `Collapsed` starts it closed, and the
  reader's choice holds while the drawer is open.
- **Tabs.** `CanopyRecordTab` (for example Overview, Fields, Related, History) lists top-level sections. Sections no tab lists
  join the last tab. A tab whose sections are all empty is not shown. The tab bar is an ARIA tablist (Left/Right, Home/End);
  the chosen tab is kept while stepping to the previous or next record.
- **Pinned summary.** `HeaderStatus` and up to six `HeaderFacts` show under the title, with their presenters, when they have
  values. Fields the summary shows are not repeated in "Other fields".
- **Empty fields** hide by default (`HideEmpty`, default true) and the reader's switch, "Show empty fields (N)", shows them;
  the choice is remembered for the page. A view without a record panel keeps its em dashes.
- **Jump list.** A tab with four or more visible sections shows a jump list of them; `JumpList` forces it on or off.
- **Section renderers.** A section with a `Renderer` name gets content a plugin draws (`drawerSections`) or the host
  (`recordSections` option), above its fields: see Charts.

## Collections

A `CanopyRecordList` holds rows with their own columns (`Columns`, `Rows`), or tree nodes (`Roots`). In the panel it is a
nested CanopyX grid with its own sorting, search (above eight rows) and paging (`PageLength`, default 10 a page); a tree
collection, or any collection on a tree-only runtime, is a nested tree. On phones collections are cards, and in print plain
tables with every row. Rows keep the order they come in.

- `Total` says how many records the whole collection has when `Rows` holds the first ones. With a record source the panel
  offers **Load more**, which asks for the field's next `PageSize` rows (default 50) with a `gridRecordQuery` that names the
  field, the offset and the limit.
- `Target` (`CanopyRecordTarget`) names the grid whose records the rows are. A row then opens its record (row ids are that
  grid's record ids), and **Open all in grid** filters that grid: by `Filters`, or `Column` in `Values`, or `Column` in the
  rows' ids. When the page has the link part (it is loaded for linked views), a `Column` list goes through the target grid's external
  filter API ([linked views](linked-views.md)): a removable chip that names the record and the field, combined with the
  reader's own conditions. Otherwise, and for `Filters`, the list replaces the target's query filters and search. The cancelable `canopyx:openAll` event and the `onOpenAll` option come first with `{ view, filters, ids,
  field, record, total }`, so a host can filter a linked view or another page instead.

  An implicit condition using row ids becomes available after every collection page has loaded and contains 1 to 1,000
  ids, including inline tree descendants. Empty or larger ID sets cannot form that membership condition. Supply nonempty
  `Filters` or `Values` when an authoritative condition can describe the whole collection before it has loaded. For a
  larger complete collection, a host can handle `onOpenAll` with a target that leaves `Column` unset. Invalid page rows,
  duplicate identities and totals below the accepted row count are rejected together; Load more retries the same offset.

## Related records and the back stack

A value with a `ref` is a link. It opens the linked record in place of the current one: in the same grid, or in the grid or
tree on the page whose view id the link names. The record it came from joins the back stack: **Back** (and Alt+Left) and the
breadcrumb trail above the title reopen it, with its tab, and return focus to the link. On phones the trail shows Back only.
A screen reader hears "Showing {record}" or "Back to {record}".

`openRecord(id)` on a grid or tree API opens any record:

- a loaded row, with previous and next over the accepted result;
- a row the grid scrolls to, when its source tells the record's position (`position(query, id)`: inline grids do; a hosted
  source may);
- an inline row outside the accepted result, or a row its record source returns (`{ row: true }`), without previous and
  next;
- on a tree, a loaded node, or one the `path` option (the node's id path) lets the tree expand to.

A record nobody has stays unopened and rejects the promise; a link says so in the drawer.

The `section` option names a section to open on (`openRecord(id, { section: "decision" })`): its tab is selected, the section
is expanded, and the drawer body scrolls to it, waiting for details that are still loading. A section the record doesn't
have is ignored, and the drawer opens at the top.

## Timelines and changes

A timeline (`CanopyRecordEvent`: time, summary, actor, kind, tone, a link, and the fields it changed) shows in the order
given, newest first being usual, grouped by day with the time in the reader's time zone setting. Changes
(`CanopyFieldChange`: name, before, after) are a before/after table; when both values are lists, the removed and added
items are marked in text ("Removed:", "Added:") as well as by style.

## Record deep links

With `DeepLink` the open record is written to the address: `#record=<view>:<id>`, next to any other `&` parameters, replacing
the history entry; closing the drawer removes it. Opening a page with such an address, or changing to one, opens the grid at
that record with its drawer open. It works offline in a single-file report, because the address is all it reads.
`DeepLinkKey` changes `record` to another parameter name; a tree writes the node's id path (`#record=tree:a/b/c`). The
**Copy link** action copies the record's address. A link can also name the section to land on, `#record=<view>:<id>&recordSection=<view>:<section>`
(`<key>Section` with `DeepLinkKey`), as the `section` option does; the parameter leaves the address once the drawer opens.

## Record actions

The head's actions menu (an ARIA menu button) has **Copy link**, **Copy values** (tab-separated) and **Copy as JSON**,
**Export CSV** and **Export JSON** (one file for the record, every field with its section, empty ones too; CSV is protected
against spreadsheet formulas) and **Print record**. `CanopyRecordPanel.Actions` switches the built-in actions off.

Print shows the record alone: every tab and section expanded, collections as full tables, in the light theme. The
cancelable `canopyx:recordPrint` event and `onRecordPrint` option receive `{ id, element }` first, so a host can print the
sheet its own way (a single-record PDF, for example).

Host actions join the menu: the `recordActions` option and a plugin's `recordActions`, each `{ label, run({ record, view,
api, payload, signal }) }`. An Excel export of one record belongs in an export plugin's action.

An action's optional `visible` predicate follows the selected record and loaded payload on each paint. `prominent` accepts
the same predicate when the host chooses a primary action per record. Both receive the action context; hidden actions
are checked again before execution. These presentation choices do not replace the host's permission check.
After a host action changes details without changing the grid row, call `openRecord(id, { reload: true })` to reload that
record's details. Other records keep their cached payloads.

## Charts in the drawer

A section's `Renderer` names a drawer section renderer: a plugin's `drawerSections` entry or the host's `recordSections`
option. It receives the record, an element above the section's fields, and a context with `values` (every field's value by
id), `payload`, `width`, `print`, `labels`, `signal` and `onDispose`. CanopyX does not depend on a chart library; the host
mounts its chart there.

```js
CanopyX.use({
  name: "expiry-chart",
  drawerSections: {
    "expiry-chart"(record, element, { values, width, onDispose }) {
      const chart = myCharts.line(element, { width, points: values.history.series });
      onDispose(() => chart.destroy());
    }
  }
});
```

Record fields can also use CanopyX's own history presenters: a number field with
`CanopyGridPresenter.SparklineLine()` and a `Series` on its cell draws a sparkline in the drawer, as the example's "Days
left, last 12 months" does.

**HtmlForgeX and ChartForgeX.** HtmlForgeX mounts a ChartForgeX chart in a drawer section the same way: it registers a
plugin whose `drawerSections` entry renders the chart's HTML and script into the element (ChartForgeX's browser API, with
the record's `values` as data), and destroys it in `onDispose`. On the C# side it names the renderer on the section
(`new CanopyRecordSection("history", "History") { Renderer = "chartforgex" }`) and carries the chart definition in a record
field or the host payload.

## Details on demand

For wide, large data (hundreds of thousands of rows, ninety columns, in one static file) rows carry only their grid cells, and
each record's details load when its drawer opens. The panel shows the row at once with "Loading…", then the fields; a failed
load says so with Retry and reports the error. Payloads are cached per view (64 records). A source answers with a
`gridRecord`: `fields` (record field values), `cells` (fuller values of grid columns for the drawer, such as a list whose
grid cell carries only "4 names") and, when asked, `row`.

- **Record packs** (`CanopyRecordSource.Sidecar("records/", shards)`): `CanopyRecordSidecar.Write(pageFolder, view, records)`
  streams each record into pack `records/r<n>.js` (n is the FNV-1a hash of the id's UTF-16 code units modulo the shard
  count). The writer keeps at most 16 pack files open and reopens a pack at its end when an interleaved record returns to
  an evicted shard. This bounds file handles; frequent shard switches can add file-open and flush work. Packs are scripts,
  so they load from `file://`. About 200 records a pack keeps each pack small; the browser keeps 16 packs.
- **The host** (`CanopyRecordSource.Host()`, or any source): the `loadRecord(request, { signal })` option answers each
  `gridRecordQuery`.
- **The remote protocol**: a hosted grid source's `record(request, { signal })` hook, which a remote client implements by
  sending the request to its server (see [data-protocol.md](data-protocol.md#record-details)). `CanopyX.Data` and
  `CanopyX.AspNetCore` serve it from .NET, by key through the grid's own query ([Record details](remote-dotnet.md#record-details)).

```csharp
var view = CertificateInventoryExample.View(CanopyRecordSource.Sidecar("records/", 1250));
foreach (var row in rowsWithCellsOnly) view.Rows.Add(row);
CanopyRecordSidecar.Write(outputFolder, view, ReadRecordDetails());   // streamed, at most 16 pack files open
view.SaveHtmlPage(Path.Combine(outputFolder, "certificates.html"));
```

Record-pack folders are unescaped local paths relative to the page and end with `/`. Spaces inside the path and Unicode
are supported; an initial ASCII space, query or fragment delimiters (`?`, `#`), percent signs, control characters,
absolute paths, backslashes and dot segments are rejected. Use a fresh output directory and publish it only after `Write`
succeeds. The writer closes its pack files when enumeration or writing fails, preserves that error if host-enumerator
cleanup also fails, and removes obsolete numbered packs only after successful
finalization. It writes encountered packs directly, so it does not atomically replace an existing report.

## Phones

At 640 pixels and narrower the drawer is a full-screen sheet: the tab bar scrolls sideways, collections are cards, buttons
and tabs are at least 44 pixels tall, and only Back shows from the trail.

## Accessibility

The drawer is a dialog labelled by its title; the tab bar is an ARIA tablist with tabs and tab panels; section headings are
buttons with `aria-expanded` and `aria-controls`; the actions menu is a menu button with menu items. Focus moves to the title
when a record opens and returns to the link a reader came from on Back, and to where the reader started when the drawer
closes. A polite live region announces navigation, copies and failures. Changes and timelines carry text, not colour alone.
Up and Down still step through records outside text inputs, tabs and nested grids.

## Trees

The tree drawer has the same panel: a tree view's `Record`, record fields on nodes (`CanopyNode.Fields`), sections (a tree
column's `Section` is now written), tones, badges and renderers, structured values, links, deep links and actions. The tree's
`onDetails({ node, signal, returnFocus })` option replaces its drawer with the host's own view, as on flat grids. Record field
presenters apply on the flat-grid runtimes; on the tree-only runtimes those fields show their text with tone and badges, and
collections are nested trees.

## Extension contract for other parts

Parts that extend the drawer (editing, conditional formatting) can rely on:

- every field's `<dt>` and `<dd>` carrying `data-cx-field` (the column or record field id), and `drawerFields(dialog)`
  listing the painted fields as `{ id, column, term, value }`;
- the dialog carrying `data-cx-record` and `data-cx-view`, and `dialog._cxRecord` being the raw record shown;
- a `cx-drawer-paint` event (`{ id, index }`) on the dialog after every paint, also after details arrive and when a tab paints its fields;
- `openGridDrawer(record, index, returnFocus, options)`, where `index` is null for a record outside the accepted result;
- `recordKeepField(id, record)`: a grid method a part defines to keep a field visible though it is empty (an editable field);
- summary facts carrying `data-cx-fact`.

## Labels

Record-only fields use `Wrap` and `MaxLines` just like visible grid columns. A nondefault line limit is retained in `record.fields`; the browser clamps the preview and keeps the full text in its tooltip.

The panel's texts are labels of every runtime (`recordBack`, `recordShowEmpty`, `recordOpenAll`, … in `CanopyLabels`), with
Polish, German, Spanish, French and Italian translations; see [labels.md](labels.md).

Host actions may set `prominent: true` to expose the same action in the drawer footer as well as the menu. The footer disables that button while its task is running. The two entry points share one task; repeat activations are ignored until it settles. `recordHeading(record)` optionally returns a plain-text `{ title, subtitle }` projection (up to 512 and 2,000 characters respectively); it receives a detached record snapshot. These presentation options do not change record identity or action authorization.
