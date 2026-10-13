# Column sizing, priority and pinning

Flat grids size their columns from their content, fill the width they are given, and decide what gives way when the
width runs short. Hosts describe intent (which column identifies a row, which columns matter, which may hide); the
runtime turns it into widths for the current container, recomputes when the container resizes, a column is shown or
hidden, or a new query result arrives, and never recomputes while scrolling. The generated examples include
`column-layout.html` (and `column-layout-dark.html`) with wide, narrow, pinned and phone-sized containers.

Tree columns use the same `CanopyColumnSizing` bounds. Their initial width is the assigned width, or 160 pixels
clamped to those bounds. Pointer and keyboard resizing, `setColumnWidth()` and restored state all honour the bounds;
the resize separator exposes them through ARIA. Automatic content fitting, flex and responsive priorities apply to
flat grids.

## How a width is chosen

1. **Need.** Each column measures its header and up to 200 loaded values with canvas `measureText`, in the font the
   column's cells render. The font is read once per column and fit from the first rendered value in that column, so a
   monospace presenter (`identifier` or `longText` with `mono`), a class a highlight rule adds, or a host renderer's own
   font is measured as drawn; there are no per-cell layout reads. One sample stands for the column: a class a rule
   adds to only some rows counts only when the sampled row has it, so style whole columns for the best fit. Until a
   column's cells have rendered (the first result, or a column shown later) its last read font, or else the grid
   font, stands in, and the columns are measured again once a rendered cell shows a different font. Presenters count
   with their drawn size: status strips and sparklines by their periods, enum chips and state dots with their padding,
   progress bars with their track, tags and lists capped like long text. The need is
   capped at 420 pixels or `maxWidth`, and is never below the header, so a header is not truncated while any column
   has slack. Wrapping columns and long-text, tag and list presenters with an assigned width keep it: they show more
   lines or a "show more" control instead of growing.
2. **Base.** A column without `width` uses its need. An assigned `width` is *preferred*: the column grows to its need
   and keeps the extra while there is room. `fixed: true` makes `width` hard. A width the reader dragged, typed or
   fitted is sticky (`sized` in the saved view) until **Reset columns** or `autoSizeColumns()`.
3. **Spare width** goes first to `flex` columns in proportion to their weights, then to the identity column up to the
   cap, then it is shared between the identity column and the widest normal text column. The right side of a grid is
   never left empty while a column can take the space.
4. **Short width** gives way in this order:
   1. normal and optional columns lose their slack, down to their header width or about eleven characters for text;
   2. optional columns hide (on phones, at 640 pixels and below, normal columns hide too); hidden columns stay in the
      record drawer, exports and the phone "+N" button, and the Columns menu marks them "Hidden at this width";
   3. only then the grid scrolls horizontally inside itself, with pinned columns in place.

   Essential columns never shrink below their need and never hide. Pinned, user-sized and `alwaysVisible` columns
   never hide either.

## Identity column and pinning

The identity column is the column marked `rowHeader`, or else the first column. It is essential and pinned left
unless the host says otherwise, so on horizontal scroll the row's name stays visible. Any column can be pinned with
`pinned: "left"` or `"right"` (for example an actions or status column); `pinned: null` unpins the identity column.
Readers pin and unpin from each header's ⋮ menu, and pins persist in saved views. An explicit order is honoured: `setColumnOrder` unpins a pinned column placed after a scrolling column, and a header move or a Columns menu move also adopts the pin of the column it lands next to. Pinned cells keep the row hover and
selection backgrounds, and a soft shadow marks the boundary only while the centre is scrolled. Pins are suspended
from the outside in when they would leave less than `reporting.minimumCenterWidth` (128 pixels by default) for the
centre.

## Column options

| Option (wire / C#) | Values | Meaning |
|---|---|---|
| `width` / `Sizing.Width` | pixels ≥ 40 | Preferred width; grows to content. `Content()` leaves it unspecified. |
| `fixed` / `Sizing.IsFixed` | boolean | `CanopyColumnSizing.Fixed(width)` keeps a hard automatic width. Users can resize it. |
| `minWidth`, `maxWidth` / `Sizing.Minimum`, `Maximum` | CSS pixels | Immutable validated bounds; the preferred width must lie within them. |
| `flex` / `Sizing.FlexWeight` | greater than 0, at most 100 | `CanopyColumnSizing.Flex(weight, minimum, maximum, preferredWidth)` shares spare width. |
| `autoSize` / `Sizing.Measure` | `content`, `header`, `none` | The sizing factory's `measure` argument chooses what measuring reads. |
| `priority` / `ResponsivePriority` | integer ≥ 0 | 0 and 1 are essential; 10000 and above optional; larger values hide first. Wire string priorities remain readable. |
| `pinned` / `Pinned` | `left`, `right`, `null` | Requested edge. Omitted: the identity column pins left. |
| `rowHeader` / `RowHeader` | boolean | Marks the identity column (at most one). |
| `alwaysVisible` / `AlwaysVisible` | boolean | Responsive fitting retains the column; explicit user hiding still applies. |

The C# authoring API has one policy owner per column. Assign `Sizing`, `Pinned`, `ResponsivePriority`, `AlwaysVisible`, `Presenter` and `Ordering` on that column. `CanopyColumnSizing.Content`, `Preferred`, `Fixed` and `Flex` reject contradictory bounds at construction. `view.GetColumn(id)` finds an existing declaration. Reporting remains the home for view-wide capabilities such as grouping, aggregates, filtering and responsive mode.

`CanopyColumnSizing.Fixed(180, minimum: 120, maximum: 240)` keeps a column at 180 pixels during automatic fitting and permits user resizing from 120 to 240 pixels. The declared width must lie within those bounds.

Readers retain the existing `reporting.layout` map (`minimum`, `maximum`, `flex`, `pin`, `priority`, `alwaysVisible`) for `canopyx/2` documents. The C# writer emits canonical column fields rather than this second authoring map.

## API and events

| Method | Effect |
|---|---|
| `autoFitColumn(id)`, `autoFitColumns()` | Set columns to their measured content width as a sticky user width (like AG Grid `autoSizeColumns`). |
| `autoSizeColumns(ids?)` | Drop user widths so the columns return to automatic sizing that fills the width (like AG Grid `sizeColumnsToFit`, kept live). |
| `setColumnWidth(id, px)` | Sticky user width. |
| `setColumnPinned(id, "left" \| "right" \| "none")` | Pin or unpin. |
| `setColumnPriority(id, priority)` | Change a column's priority (string or integer). |
| `setColumnVisible(id, visible)`, `setColumnOrder(ids)`, `resetColumns()` | Visibility, order, and the declared layout. |

The reporting runtime adds `getColumnLayout()`, one frozen entry per declared column in the current order:
`{ id, requestedPin, pin, visible, hiddenReason, responsiveHidden, width }`. `visible` is false whenever the column is
out of view, and `hiddenReason` says why:

| `hiddenReason` | Cause |
|---|---|
| `null` | The column is shown. |
| `"user"` | The reader or the host hid it (Columns menu, header menu, `setColumnVisible`, a saved view, `hidden` in the definition). |
| `"priority"` | It gave way to the width: an optional column, or a column hidden by `reporting.responsive` and its layout `priority`. |
| `"phone"` | A normal column hidden by the phone layout (640 pixels and below), which hides normal columns as well as optional ones. |

Only `"user"` is saved in views; the other reasons follow the container width and clear when it grows again.
`responsiveHidden` stays for existing hosts and is true only for the `reporting.responsive` policy.

`canopyx:columnResize` (`onColumnResize`) reports `{ column, width }` after a pointer resize or a `setColumnWidth`/`autoFitColumn` call, and
`canopyx:columnPin` (`onColumnPin`) reports `{ column, pin }`. Saved views (`getState()`, named views and durable
storage) keep each column's order, visibility, width, `sized`, `pin` and `priority`.

## Columns menu

The toolbar's Columns menu lists every column with a drag handle, a checkbox and its label; labels end with an
ellipsis and a tooltip instead of wrapping. Drag a row by its handle, or press Alt+Up or Alt+Down on its checkbox or
handle, to reorder. A moved column joins the pinned group it lands in. A "Find a column…" field appears when there are
more than eight columns, and **Show all** and **Reset columns** sit at the bottom. Pinning, fitting and hiding a single
column live in the header's own ⋮ menu.

## Coming from DataTables or AG Grid

| DataTables | AG Grid | CanopyX |
|---|---|---|
| `autoWidth: true` | `autoSizeStrategy: { type: "fitCellContents" }` | Default: columns measure header and loaded values. |
| `columns.width` | `width` | `width`, preferred unless `fixed`. |
| — | `minWidth`, `maxWidth` | `minWidth`, `maxWidth`. |
| — | `flex` | `flex`. |
| — | `suppressAutoSize`, `resizable: false` | `autoSize: "none"`, `fixed: true`. |
| Responsive `responsivePriority` | — | `priority` as an integer; or `essential` / `normal` / `optional`. |
| Responsive child rows | — | Record drawer and the phone "+N" button. |
| FixedColumns `left` / `right` | `pinned: "left" \| "right"` | `pinned: "left" \| "right"`; the identity column pins left by default. |
| `columns.adjust()` | `sizeColumnsToFit()` | Automatic on resize; `autoSizeColumns()` drops user widths. |
| — | `autoSizeColumns(ids)` | `autoFitColumns()` / `autoFitColumn(id)`. |
| `column-visibility` buttons | Columns tool panel | Columns menu with find, drag reorder, Show all and Reset columns. |
| — | `columnResized`, `columnPinned` events | `canopyx:columnResize`, `canopyx:columnPin`. |

The grid has no right-to-left layout yet; pinning and the shadow edges assume left-to-right documents.
