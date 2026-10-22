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

1. **Choose visible columns.** Apply reader visibility, responsive priority and
   pin rules. Optional columns can hide when compact estimates do not fit. On
   phones, normal context moves below the identity. Essential, reader-sized and
   always-visible fields retain their protections.
2. **Measure two header targets.** The minimum is the longest unbreakable word,
   plus padding, sort, filter, menu and reorder affordances. The preferred header
   width is the narrowest balanced split into at most two lines, with the same
   affordances. Reorder glyphs use their measured font advance. The header row
   grows to the actual wrapped height; its height participates in auto-height.
3. **Start at the larger of preferred width and measured need.** Measured need
   includes the balanced two-line header target and formatted content. Atomic
   pills keep their full measured width. Fixed and reader-sized columns stay at
   their explicit widths, bounded by authored minima and maxima.
4. **Remove spare reading space before content.** First shrink towards the
   greater of content and the balanced two-line header target. If that does not
   fit, header-only space can yield towards the longest-word target. In every
   pass the floor is the greater of the content minimum, header target and
   affordances. A dash-only column therefore gives way before a status pill.
   Headers wrap before they truncate or cause horizontal scrolling. If two
   lines still cannot hold a title, it truncates with the full title in its
   tooltip and accessible name. Explicit width constraints remain authoritative.
5. **Scroll only when the sum of the minimums does not fit.** Keep these floors
   in the scrolling row too. Do not clip pills or other content to manufacture
   a fit. Scroll/card modes retain their established base-width policy.
6. **Distribute spare width.** Restore balanced header targets first, then
   preferred reading widths, then weighted flex and ordinary text growth.
   Fixed and reader-sized columns do not grow. Whole-pixel rounding respects
   the viewport budget and explicit maxima.

The five-column fixture (Record, Responsible team, Latest verification outcome,
Recommended follow-up decision, Observations requiring attention) fits a 1086 px
host with complete headers on no more than two lines and no horizontal scrolling.
Its narrowest content includes status pills, so fitting cannot pass by clipping
those values. `grid-wrapped-report.spec.mjs` checks both themes with real glyph
rectangles rather than only comparing element widths.

On phones (hosts up to 640 px), the automatic row header retains at least 40% of
the grid width, or its smaller content need. It wraps to two lines before
truncating, with the full value in a tooltip. Essential priority 0/1 fields keep
their content minimums when they fit beside that identity. Otherwise they move
into a quiet second line, followed by the next normal fields in priority order,
up to two context fields. Author-hidden columns never enter that line. Context
values retain full-value tooltips and normal presenters; oversized atomic pills
scroll within their context slot. Automatic phone rows use measured heights so
the two-line identity and context remain inside their record. Explicit fixed,
reader-sized and always-visible policies remain authoritative.

The residual `+1 column` / `+2 columns` button sits on the quiet line, away from
the identity. It counts only current-view fields hidden by responsive priority
that the quiet line does not already show. It has an accessible name and a
tooltip listing those fields, opens the record drawer, and disappears when all
hidden fields appear in the second line. `hiddenColumns` uses the existing
localized plural catalogue and number formatting. The 390 px fixture checks
that an identity longer than the viewport causes no document overflow, retains
at least twelve visible characters beside two essential peers, and never shares
its primary line with the residual disclosure.

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

Pill content minimums use the computed font, letter spacing, inline padding and border of a hidden pill probe inside the styled grid. Host themes can style `.p-pill` normally; fitting and `autoSizeColumns()` use those styles. After changing a host stylesheet dynamically, call `autoSizeColumns()` to invalidate the measured widths.

Body-appended record drawers, column popovers and full-text dialogs accept the mount option `overlayClass: "report-style custom-theme"`. These space-separated classes are copied onto each overlay root when it opens, alongside CanopyX's own classes and inherited theme variables. Style both the host and overlay through the same marker class (for example `.report-style .p-pill`); classes on arbitrary ancestors are not copied. Changing the option affects subsequently opened overlays.

The record drawer has a labelled `Close` control (×); previous and next record controls keep their separate accessible names. `GridCloseRecord` localizes the close label.

Reporting layout policies also feed the shared fitter: `reporting.layout[columnId].priority` is the fallback when the column has no declared priority. An explicit column priority takes precedence. Essential fields therefore retain the same rank in responsive visibility, the phone record line, and saved layout restoration.
