# Column groups

Column groups draw named header rows above a flat grid's columns: months under quarters under half years, measurements
under their instrument, a person's contact fields under "Contact". Up to three levels of groups sit above the column
headers, inside the sticky header. Semantic grouping is the default: every grid feature that changes columns keeps the groups whole.

Groups ship as the `column-groups` part (`canopyx-column-groups.js` and `.css`, see [Plugins and Parts](plugins.md)). A
grid whose view declares `columnGroups` loads it with its first query; grids without groups never load it, and the .NET
writers carry its payload only in pages whose grids declare groups.

## Declaring groups

For labels that should follow the displayed columns without governing them, use **presentation bands**:

```csharp
grid.ColumnGroupMode = CanopyColumnGroupMode.Presentation;
grid.ColumnGroups.Add(new CanopyColumnGroup("identity", "Identity", "host", "rootDomain"));
grid.ColumnGroups.Add(new CanopyColumnGroup("live", "Live", "liveBefore", "liveAfter"));
```

The equivalent wire setting is `columnGroupMode: "presentation"`; omission or `"semantic"` retains semantic grouping.
Presentation members may be nonadjacent. With authored order `host, liveBefore, rootDomain, liveAfter`, four bands appear.
If responsive fitting or the ordinary Columns chooser hides `rootDomain`, the two visible Live members become one span;
showing it again splits that span. Reordering columns recomputes bands in the new visible order. Effective pin boundaries
split a span, without changing requested pins or the grid's pin budget. Distinct group IDs remain distinct even if their
titles match. Nested definitions retain their levels.

Presentation bands have text headers with accessible column indices and spans, without group-wide resize, move or hide
controls. The ordinary per-column controls, query, saved views, export capture and record-drawer sections retain their
existing behavior. Group `pinned` settings are refused in this mode; set pins on individual columns. No adapter-side
observer, group rebuilding or private grid access is needed. The same optional `column-groups` part handles both modes.

`getColumnGroups()` describes the logical definitions, with `pin: "mixed"` when presentation members have different
requested pins. `getColumnBands()` reads the actual displayed spans, in level/column order:

```javascript
// Each frozen entry has id, title, columns, level, columnIndex, columnSpan and effective pin.
const bands = grid.getColumnBands();
```

Indices and levels are one-based. A logical ID can occur in several spans. Both reads answer empty before the part loads.
The script-free fallback draws contiguous spans over its visible columns in authored order, splitting at declared pins;
it has no viewport and does not run responsive fitting. Export capture retains the ordinary column projection and values.

The remaining examples describe the default semantic grouping mode.

A group lists the columns directly below it and its nested groups. A column belongs to one group at most; columns
outside every group keep their header in the bottom row.

```csharp
var grid = new CanopyDataGridView("budget", "Quarterly budget");
grid.Columns.Add(new CanopyColumn("line", "Budget line") { RowHeader = true });
foreach (var month in months) grid.Columns.Add(new CanopyColumn(month.Id, month.Title) { Kind = CanopyColumnKind.Number });
grid.Columns.Add(new CanopyColumn("total", "Year total") { Kind = CanopyColumnKind.Number });

grid.ColumnGroups.Add(new CanopyColumnGroup("h1", "First half") {
    Groups = { new CanopyColumnGroup("q1", "Q1", "jan", "feb", "mar"), new CanopyColumnGroup("q2", "Q2", "apr", "may", "jun") }
});
grid.ColumnGroups.Add(new CanopyColumnGroup("h2", "Second half") {
    Groups = { new CanopyColumnGroup("q3", "Q3", "jul", "aug", "sep"), new CanopyColumnGroup("q4", "Q4", "oct", "nov", "dec") }
});
```

The view document carries the same tree:

```json
"columnGroups": [
  { "id": "h1", "title": "First half", "groups": [
    { "id": "q1", "title": "Q1", "columns": ["jan", "feb", "mar"] },
    { "id": "q2", "title": "Q2", "columns": ["apr", "may", "jun"] } ] },
  { "id": "h2", "title": "Second half", "pinned": "left", "columns": ["total"], "groups": [ … ] }
]
```

| Field | Meaning |
| --- | --- |
| `id` | The group identity, unique among the grid's groups. The API and the DOM (`data-cx-group`) use it. |
| `title` | The header text, 1 to 256 characters. |
| `columns` | Columns directly below the group, in any order. |
| `groups` | Nested groups. A group needs columns, groups or both. |
| `pinned` | `left`, `right` or `null`: the initial pin of every column of a top-level group. Nested groups take none. A view restored from saved state keeps the reader's pins. |

A group's columns take their places in the grid's column order. The .NET writer requires them to be adjacent in
`Columns`, and the explicit pins of a top-level group's columns to agree with each other and with the group's pin; it reports
a clear error otherwise. A view written by hand that scatters them is accepted, and the grid gathers
each group where most of its columns are. A malformed `columnGroups` (an unknown column, a column in two groups, more than
three levels) is reported through the grid's `error` event, and the grid keeps one plain header row.

## How groups behave

- **Sticky headers.** The group rows are part of the header, so they stay at the top while the rows scroll.
- **Pinning.** Pinning any column of a top-level group pins the whole group (from the column menu or
  `setColumnPinned`). A group never splits across a pinned edge: when the pin budget (the width left for the scrolling
  centre) cannot hold a pinned group, the whole group scrolls; its requested pin is kept and returns when there is room.
- **Priority hiding and visibility.** A group spans only its visible columns. When the phone layout, responsive priority or
  the reader hides some of its columns the group shrinks; when all are hidden, the group disappears, and a level with no
  group left takes its header row with it.
- **Resizing.** A group's edge resizes its visible columns together, each in proportion to its width, by pointer or with
  Left and Right (Shift for larger steps). The widths become user widths, as a column's own edge makes them.
- **Moving.** Columns move only among the members of their own group, and whole groups move together. A column dragged out
  of its group returns to the group's near edge; a group whose columns all move goes with them. This holds for the Columns
  menu, header moves (`reporting.columnReorder`) and `setColumnOrder`.
- **Columns menu.** The menu nests columns under their groups (each group a `role="group"` named after it). A group's check
  box shows or hides all of its columns and is mixed while some are hidden; its handle and Alt+Up/Down move the whole group
  among its siblings. Find shows a matching column with its groups, and a matching group with all its columns.
- **Header moves.** With `reporting.columnReorder`, each group header has a move handle: drag it, or press Left or Right.
  The move is announced with `gridColumnMoved`.
- **Phones.** In the record drawer, each grouped column sits in a section named after its group (the titles down to it
  when a group title repeats). A column's own `section` still wins.
- **Saved views and reset.** Saved views keep the column order and pins, so groups come back as they were; Reset columns
  restores the declared order and the groups' declared pins.
- **Copying with headers.** Range copies with headers carry the group rows above the column titles
  ([Cell ranges](cell-ranges.md)).
- **Script-free fallback and print.** The static table draws the same header rows with `colspan` and `rowspan`
  (group cells are `scope="col"` headers with `colspan`).

## Accessibility

Each header level is a `row` in the header `rowgroup`, with `aria-rowindex` from 1. A group cell is a `columnheader` with
`aria-colindex` (its first column) and `aria-colspan` (its visible columns); its accessible name is its title. The empty
cells above ungrouped columns are hidden from assistive technology. Body rows and `aria-rowcount` count the extra header
rows, so row numbers stay right. The group resize handle is a `separator` named "Resize {group}" with its width as
`aria-valuenow`, the sum of their narrowest and widest widths as `aria-valuemin` and `aria-valuemax`, a step of 10 pixels a
column (50 with Shift) and Home for the narrowest widths.

## API

| Member | Result |
| --- | --- |
| `getColumnGroups()` | The groups in their current order: `{ id, title, columns, visibleColumns, pin, groups }`, with columns in the current column order. An empty list before the part loads or without groups. |
| `setColumnGroupVisible(id, visible)` | Shows or hides every column of a group. At least one column of the grid stays visible. Answers with a promise that rejects for an unknown group or when it would hide every column; it never raises the `error` event. |
| `setColumnPinned(id, pin)` | Pins a column's whole top-level group. |
| `setColumnOrder(ids)` | Orders the columns; groups are kept together as described above. |

TypeScript: `GridColumnGroup`, `GridColumnGroupState` and `GridColumnGroupApi` from `@evotecit/canopyx/grid`.

## Example

`quarterly-budget.html` (and `quarterly-budget-dark.html`) shows months under quarters under half years with the budget
line pinned at the left; `quarterly-budget-reorder.html` adds header move handles on the reporting runtime.
