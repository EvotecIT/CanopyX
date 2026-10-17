# Column sizing, priority and pinning

Flat grids and trees size their columns from their content, fill the width they are given, and decide what gives way when the
width runs short. Hosts describe intent (which column identifies a row, which columns matter, which may hide); the
runtime turns it into widths for the current container, recomputes when the container resizes, a column is shown or
hidden, or a new query result arrives, and never recomputes while scrolling. The generated examples include
`column-layout.html` (and `column-layout-dark.html`) with wide, narrow, pinned and phone-sized containers.

## Trees

Trees run the same fit routines (`canopyx.grid.source/33-column-fit-core.js`) from their tree tools part, with these
differences:

- **Need.** A tree column measures the header and up to 2,000 visible rows (not loaded but collapsed ones) in the grid
  font. The tree column adds each row's indent (18 pixels a level below the first), the 18-pixel expander and the cell's
  gaps, its icon, an interactive checkbox and its badges, so its need is the width of its deepest, longest visible row.
  It is measured whole, up to its `maxWidth`; other columns stop at 420 pixels. Columns are measured again when the
  visible rows change (expanding, collapsing, filtering, sorting, loading), at most once a frame, never while scrolling.
- **Identity and pinning.** The tree column is always the identity column: essential, first, and pinned left while the
  other columns scroll, unless it declares `Pinned = CanopyGridColumnPin.None` (`pinned: null`). `PinTreeColumn` no
  longer changes the default (it can only pin), while `setTreeColumnPinned` and remembered state still decide at run time. `RowHeader` is a flat-grid option.
- **Pins.** As on a flat grid, any other column pins left or right (`Pinned = CanopyGridColumnPin.Left` or `Right`, `pinned:
  "left"` or `"right"`, or `setColumnPinned(id, pin)` at run time): left pins follow the tree column and right pins stay at
  the right edge while the other columns scroll. They keep their place next to their edge when the reader reorders columns,
  never hide for width (except on phones, see **Hiding** below), and are part of remembered state and named views; **Reset columns** returns to the declared pins.
  When the pins would leave the scrolling columns less than 128 pixels, the innermost of them scroll too.
- **Widths.** A content-sized column (`CanopyColumnSizing.Content`, the default) writes `autoWidth: true` and 160 pixels as
  the width a tree uses until the tree tools part has measured; an assigned width is preferred. User widths are sticky
  (`sized` in remembered state and named views) until **Reset columns**; a host's restored width that differs from the
  declared one counts as a user width. Pointer and keyboard resizing start from the width on screen.
- **Hiding.** Optional columns hide first, normal ones too on phones (a host of 640 pixels or less), as on flat grids. The
  Columns menu marks them "Hidden at this width"; exports keep them. On phones the tree column keeps its indent and about
  two dozen characters (see the identity column below), the tree column holds the "+N" button of the hidden fields, and
  the button opens the row's record drawer with every column; **Record details** in the more menu opens it for the focused
  row, and `openDetails(id)` for any visible node.

The `tree-parity.html` example (and `tree-parity-dark.html`) shows an organisation chart, a file system eleven levels deep
and nested groups that start collapsed to three rows. The `wide-tree.html` example (and `wide-tree-dark.html`) is a document
library with more columns than a laptop shows: the owner pins left, the status right, the description takes the spare width,
the optional version and reviewer hide first, and the long path shows in a tooltip when it is cut off. On a phone the
owner hides too and the essential status stays beside the tree column and its "+N" button.

## Tooltips and header room

A column's `Tooltip` (`tooltip`) shows on hover: `"auto"` (`CanopyColumn.AutoTooltip`) shows a cell's full value while it is
cut off, and the id of another declared column shows that column's text. A cell's own `title` wins. Flat grids and trees both read it.

A flat grid's header keeps room for its column menu button (32 pixels, 52 on phones) while columns are fitted. A host that
draws no column menus switches them off with `Toolbar.ColumnMenus = false` (`toolbar: { columnMenus: false }`): the buttons
are not built and the headers keep no room for them. Sorting from the header keeps working, an active header filter keeps its
button, and readers start filters from the Filters menu.

A number column's title sits at the right, over its numbers. With a mouse its menu button shows on hover at the left of
the header; on phones and touch screens, where the button always shows, it follows the title instead, so the header reads
as one cell ("Overall ⋮"), and so does an active header filter.

## How a width is chosen

1. **Need.** Each column measures its header and up to 200 loaded values with the grid font (canvas `measureText`, no
   DOM reads). Presenters count with their drawn size: status strips and sparklines by their periods, enum chips and
   state dots with their padding, progress bars with their track, tags and lists capped like long text. The need is
   capped at 420 pixels or `maxWidth`, and is never below the header, so a header is not truncated while any column
   has slack. Wrapping columns and long-text, tag and list presenters with an assigned width keep it: they show more
   lines or a "show more" control instead of growing.
2. **Base.** A column without `width` uses its need. An assigned `width` is *preferred*: the column grows to its need
   and keeps the extra while there is room. `fixed: true` makes `width` hard. A width the reader dragged, typed or
   fitted is sticky (`sized` in the saved view) until **Reset columns** or `autoSizeColumns()`.
3. **Spare width** goes first to `flex` columns in proportion to their weights, then to the identity column up to the
   cap, then it is shared between the identity column and the widest normal text column. The right side of a grid or
   a tree is never left empty while a column can take the space: when no column grows, and for the pixels that rounding
   the widths down leaves, the last text column below its maximum that is neither fixed nor sized by the reader takes
   the rest, so the rows end at the right edge (number and graphic columns keep their width).
4. **Short width** gives way in this order:
   1. normal and optional columns lose their slack, long free text first: `flex` columns, then the text columns from the
      widest down (levelled to one width), and only then the others, so dates, numbers, states and short names keep their
      whole width while the total allows; no column goes below its header width or about eleven characters for text;
   2. optional columns hide (on phones, at 640 pixels and below, normal columns hide too); hidden columns stay in the
      record drawer, exports and the phone "+N" button, and the Columns menu marks them "Hidden at this width";
   3. only then the grid scrolls horizontally inside itself, with pinned columns in place.

   On phones the first shown column also holds the "+N" button that opens the hidden fields, so fitting reserves the
   button's width beside that column's content (hiding another column when that is what makes room): with no width to
   spare, the identity column still shows its values in full next to the button.

   Essential columns never shrink below their need and never hide. Pinned, user-sized and `alwaysVisible` columns
   never hide either, except on phones: there the identity column (a tree's tree column) keeps its indent and about two
   dozen characters beside its "+N" button, and pinned columns that are not essential hide too, after the unpinned ones and
   in the same priority order, rather than cut it short.

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
| `autoFitColumn(id)`, `autoFitColumns()` | Set columns to their measured content width as a sticky user width. |
| `autoSizeColumns(ids?)` | Drop user widths so the columns return to automatic sizing that fills the width, and keep refitting as the width changes. |
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

## Limitations

The grid has no right-to-left layout yet; pinning and the shadow edges assume left-to-right documents.
