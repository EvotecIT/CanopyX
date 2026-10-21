# Grid column fitting

Flat grids fit loaded content into the host's available width. A preferred width
reserves useful reading space; long headers yield before cell content. If the
remaining safe widths exceed the viewport, the grid scrolls horizontally.

For example, a report can reserve 240 pixels for the record and 260 for the team:

```csharp
grid.Column(row => row.Name, "Record",
    column => column.Sizing = CanopyColumnSizing.Preferred(240));
grid.Column(row => row.Team, "Responsible team",
    column => column.Sizing = CanopyColumnSizing.Preferred(260));
grid.Column(row => row.State, "Latest verification outcome",
    column => column.Presenter = CanopyGridPresenter.Enum());
```

`ReportGridLayoutExample.cs` generates a typed three-row example in both themes.
No product-specific width adjustments or host resize callbacks are needed.

## Measurements and constraints

The grid measures the header and up to 200 loaded rows per column, using formatted
cell text and the effective fonts. The content measurement includes cell padding,
selection controls, and presenter decoration. Enum pills include their bold font
and inline padding; successful enum values use the ordinary font and state dot.
Quiet enum values retain their inset. Atomic enum and state labels are not capped
at the ordinary text estimate of 420 pixels. The existing text measurement limit
of 512 characters still applies.

The measurements are cached per accepted query and desktop/phone layout. They are
estimates of loaded data, not a scan of every row in a remote dataset. A later
query measures its loaded sample again. Wrapping and long-text/list/tag columns
with preferred widths retain those widths and their existing wrapping or
expansion behavior. `autoSize: "header"` measures headers; `autoSize: "none"`
retains the declared sizing basis.

Explicit minimum and maximum widths bound every automatic and user width. Fixed
columns retain their authored width during fitting. A drag, keyboard resize, or
`setColumnWidth` creates a user width that fitting preserves within those bounds,
including when it is narrower than measured content. Such explicit constraints
can intentionally truncate content. Reset columns or `autoSizeColumns` restores
automatic sizing. Preferred widths are automatic floors, not fixed widths: a
column can grow to accommodate content or receive spare space.

## Width allocation, in order

1. **Choose visible columns.** Apply the existing user visibility, responsive,
   priority, and pin rules using their compact estimates (including the existing
   eleven-digit estimate for normal text). Content floors govern the widths of
   retained columns, not which fields remain visible. Optional columns can hide
   when the compact estimates do not fit. Phone layouts can also hide normal columns and reserve the first
   shown column's `+N` button; essential, explicitly sized, and always-visible
   columns follow the existing protections.
2. **Start at measured or preferred width.** Each automatic column starts at the
   greater of its measured need (header or content) and preferred width, clamped
   to its minimum and maximum. Phone disclosure space is included. Fixed and
   user-sized columns retain their widths.
3. **Remove header-only slack.** If the total exceeds available width, calculate
   each column's slack above the greater of measured content and preferred width.
   Preserve space for the header's sort, menu and filter controls and their
   minimum pointer targets, even when the cell content is only a dash. Remove
   the same fraction of the remaining slack from every column, including numeric
   columns, until the grid fits or this slack is exhausted. Fixed and user-sized
   columns have no slack. Header text may truncate with an ellipsis; the complete
   authored title remains available through its native tooltip and accessible
   header label. Sorting and resize controls remain usable.
4. **Scroll when the floors cannot fit.** The row and canvas retain the sum of
   the resulting widths. The scroll container exposes horizontal scrolling;
   fitting does not squeeze measured text, identity values, pills or other
   content to manufacture a viewport fit. Explicit wrapping, long-text
   presenters and authored or user width constraints retain their documented
   clipping or expansion policy.
   Scroll/card layout modes keep each column's base width instead of performing
   shortage fitting or automatic hiding.
5. **Distribute spare width.** Once the base widths fit, weighted flex columns
   receive spare width up to their maxima. The identity column grows toward
   420 pixels; it and the widest normal text column then share remaining space,
   respecting maxima. Fixed and user-sized columns do not grow. Render widths
   round down to whole CSS pixels; a remaining pixel budget goes to a growing
   text column with room. Explicit maxima may leave unused space.

The grid specializes its measurement floors and header-slack pass. Trees retain
their existing shared fitting policy.

## Auto-height and horizontal scrolling

For a nonempty grid with auto-height enabled, the content height is the sum of
the grid children's actual rendered heights, vertical borders, and the actual
horizontal scrollbar gutter. The gutter is measured as `offsetHeight -
clientHeight - vertical borders` only when horizontal content exceeds the
viewport. Classic scrollbars contribute their measured thickness; overlay or
zero-gutter scrollbars contribute zero. No fixed scrollbar allowance is added.

The host's rendered space outside the grid supplies toolbar, summary, pager, and
other chrome height. Fractional rendered heights are retained until the final
upward rounding. The host's original maximum height remains a bound; longer
results scroll vertically within it. Empty results restore the original maximum.

Height is recalculated after column widths change, after the rendered row total
changes, and through the existing resize observer when the grid or header size
changes. Hidden views wait for a measurable visible grid. Container resizing,
wrapped chrome, and user widths can add or remove a scrollbar without changing
the number of rows. Three rows in a 1196-pixel canvas inside a 1086-pixel host
therefore remain fully visible above a classic horizontal scrollbar, subject to
the host's explicit height bound.
