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
automatic sizing. Preferred widths are reading-space targets, not fixed widths.
They receive space before ordinary growth, after readable header and content
minimums. This prevents empty preferred space in one column from cutting another
column's header. Use fixed sizing or an explicit minimum when a width must never yield.

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
3. **Protect header minimums before preferred whitespace.** An automatic column's
   header minimum is its measured label plus sort, menu, filter and reorder
   affordances, capped at 320 pixels and bounded by explicit sizing constraints.
   Reorder handles include their measured glyph advance and padding, so a wider
   fallback font cannot consume space reserved for the header label.
   If the total exceeds available width, remove whitespace above the greater of
   this header minimum and measured content first, including preferred whitespace.
   Fixed and reader-sized columns do not yield. Only when the header minimums
   themselves cannot collectively fit may header-only space yield to content.
   Keep the sort/menu controls' minimum pointer targets even for a dash-only
   column. A header beyond the cap or one that must yield truncates with an
   ellipsis; its complete title remains in its tooltip and accessible name.
   When header minimums fit but content requires a wider row, keep those header
   minimums in the horizontally scrolling row too.
4. **Scroll when the floors cannot fit.** The row and canvas retain the sum of
   the resulting widths. The scroll container exposes horizontal scrolling;
   fitting does not squeeze measured text, identity values, pills or other
   content to manufacture a viewport fit. Explicit wrapping, long-text
   presenters and authored or user width constraints retain their documented
   clipping or expansion policy.
   Scroll/card layout modes keep each column's base width instead of performing
   shortage fitting or automatic hiding.
5. **Distribute spare width.** Restore truncated headers to their capped minimums
   first, then restore preferred reading widths. Only then do weighted flex columns
   receive spare width up to their maxima. The identity column grows toward
   420 pixels; it and the widest normal text column then share remaining space,
   respecting maxima. Fixed and user-sized columns do not grow. Render widths
   round down to whole CSS pixels; a remaining pixel budget goes to a growing
   text column with room. Explicit maxima may leave unused space.

On phones (hosts up to 640 pixels wide), essential priority 0/1 columns keep
their measured content and pill widths. An automatic row-header column gives
space to those fields, even when it has a preferred width. Its text truncates
with the complete value in a tooltip; fixed and reader-sized widths still win.
When the essential fields and a useful primary line cannot fit together, automatic
essential columns move into a quiet second line beneath the row header. Up to two
hidden essential fields appear there, using their normal value presenters. When
only the row header and at most one other column fit, the next columns in priority
order fill any remaining second-line slots. This keeps records with the same name
distinguishable by context such as a domain or owner. Author-hidden columns never
enter that line. Values truncate inside their slot and retain their full tooltip. Other
hidden fields stay in the drawer. Rows with this line follow its measured height;
other rows keep their authored height policy, including during recycling and
container resizing. Fixed, reader-sized and always-visible columns retain their
explicit policy; scroll mode keeps horizontal scrolling.

The first shown cell's `+1 column` / `+2 columns` button counts only columns in the current
view that responsive or fitting priority hid. Columns hidden by the author or
reader and fields already shown in the second line do not contribute. The button has an accessible name and a tooltip
listing the hidden titles, and opens the existing record drawer. When no view
columns remain beyond the second line, the button is absent. The `hiddenColumns`
plural label follows the grid's normal text catalogue, including localized numbers.
The primary line has a contained ellipsis and full-value tooltip, so an identity
longer than the viewport cannot widen the document.

The grid specializes its measurement floors and header-slack pass. Trees retain
their existing shared fitting policy.

## Auto-height and horizontal scrolling

Chrome added after mounting is measured in its normal flow, even when it grows
beyond the previous fitted height and temporarily leaves the grid body with no
height. The next measurement restores room for the header and rows. Positioned
overlays do not contribute to this chrome measurement.

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
