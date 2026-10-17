# Accessibility

This page describes the keyboard model and ARIA roles of CanopyX views, the display modes they support, and what the automated tests check. It is a record of what is built and tested, not a conformance claim: no WCAG conformance statement is made beyond what the tests below show, and the screen-reader pass in [screen-reader-test.md](screen-reader-test.md) has not been recorded yet.

## Roles and states

**Trees** follow the ARIA tree grid pattern ("Accessibility Contract" in [architecture.md](architecture.md) has the full list):

- the grid is `role="treegrid"` with `aria-rowcount`, an accessible name from the view label, and `aria-multiselectable` when multi-select is on;
- rows carry `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` (rows that can expand), `aria-selected`, `aria-busy` while their children load, and `aria-rowindex`;
- cells are `gridcell`, headers are `columnheader` with `aria-sort` on sortable columns, and column resize grips are `separator`s with `aria-valuemin`, `aria-valuenow` and `aria-valuemax`;
- `aria-setsize` counts children that have not loaded yet, and a polite live region announces how many have loaded after each page.

**Flat grids** follow the ARIA data grid pattern: the grid is `role="grid"` with header and body `rowgroup`s, `row`s with `aria-rowindex` and `aria-selected`, `gridcell`s and `columnheader`s.

**Toolbars, menus and drawers**: menus are `role="menu"` with `menuitem`, `menuitemcheckbox` and `menuitemradio` entries, the Columns list uses labelled checkboxes, search results are a `listbox` of `option`s behind a `combobox`, and the record drawer is a labelled dialog that returns focus to the row it was opened from. Decorative icons are `aria-hidden`.

## Keyboard model

A view is one Tab stop: focus is a roving `tabindex` on rows, and Tab leaves the grid. Controls a host draws into cells or details are taken out of the Tab order and reached with cell navigation.

| Keys | Trees | Flat grids |
| --- | --- | --- |
| Up, Down | Previous or next row | Previous or next row (in a cell: the same column) |
| Page Up, Page Down | A page of rows | A page of rows |
| Home, End | First or last row | First or last cell of the row; with Ctrl or Command, the first or last row |
| Right | Expands, then moves to the first child; on a row with nothing to open, enters the first cell with a control | Next cell, or the next control in the cell |
| Left | Collapses, then moves to the parent; from the first cell, back to the row | Previous cell or control; from the first cell, back to the row |
| Enter | Toggles and selects; on "Show more", loads the next page | Opens record details (or follows the row's link); in a cell, enters it |
| Space | Selects (toggles in multi-select) | Selects (toggles in multi-select) |
| Shift, Ctrl with a selection key | Extends a multi-select | Extends a multi-select |
| F2 | Enters the first cell with a control; again, back to the row | Enters the first cell; again, back to the row |
| Escape | Leaves a cell or control, closes a menu | Leaves a cell or control, closes a menu or the drawer |
| Ctrl or Command + Enter | | Opens record details |
| Ctrl or Command + C | | Copies the focused cell, or the row, or the selection |
| Letters | Type-ahead to the next matching label | |

Controls that use the arrow keys themselves (text boxes, lists, radio buttons, tabs) keep them: the arrows stop at their cell, Enter goes into the control and Escape comes back out. Menus open from their button with Enter, Space or Down, move with the arrow keys, Home and End, and close with Escape, returning focus to their button. One CanopyX menu is open at a time.

## Display modes

### Forced colours (Windows high contrast)

Under `forced-colors: active` the browser replaces author colours with the system palette, and drops backgrounds and shadows. CanopyX keeps every state visible with system colours:

- a selected row or search result is drawn in `Highlight` with its text and icons in `HighlightText`, so no text sits on `Highlight` in another colour;
- keyboard focus is a solid 2 pixel outline in the system text colour, and in `HighlightText` on a selected row; menu items, options, buttons and summaries that showed focus with a background get the outline too;
- pressed toolbar toggles use `Highlight`;
- enum pills and badges keep a 1 pixel outline once their fill is gone, and status dots are drawn in `CanvasText`;
- icons draw in the current text colour; menus, popovers and the record drawer keep their borders; scrollbars are the system's.

### Reduced motion

Under `prefers-reduced-motion: reduce` nothing in a view, its menus, sheets or drawers transitions or animates: the expander chevron turns at once, the loading spinner and skeleton shimmer stand still, and smooth scrolling is off. The runtime never animates scrolling from script.

### Zoom and reflow

At 200% zoom (a 1280 pixel window becomes 640 CSS pixels wide) and at 400% zoom (320 CSS pixels), the page does not scroll sideways: the toolbar wraps and moves controls into its More menu, the Columns menu becomes a bottom sheet whose content scrolls, and the record drawer fits the width. The rows of a grid keep their columns and scroll inside the grid, as data tables may.

### Pointer targets

Interactive controls in views are at least 24 by 24 CSS pixels (WCAG 2.2 target size), through the control's own box, a larger hit area that does not move the layout (expanders, the "+N" hidden-fields button), or spacing that keeps a 24 pixel circle on a smaller control clear of every other target (links in cells, row checkboxes). On phone widths, toolbar buttons, the pager, header menu buttons and drawer buttons are 44 pixels tall, and the "+N" button's hit area grows towards 44 pixels.

Known exception: column resize grips are narrow drag handles. The same width change is available from the keyboard on the focused grip (arrow keys) and from the column menu (Fit to content, Reset columns).

## What is tested, and how

| Area | Test | What it checks |
| --- | --- | --- |
| axe-core over every example | `tests/browser/specs/axe-examples.spec.mjs` | Every generated example page at 1440 x 900 and at 390 x 844 with touch, in light and dark (pages with a dark twin in their own theme, pages that follow the system in both), against the WCAG 2.0, 2.1 and 2.2 A and AA rules and best practices. Serious and critical violations fail; moderate and minor ones are attached to the report. |
| axe-core on open states | `tests/browser/specs/accessibility.spec.mjs` | No violations of any impact with folders, details and selection open, the column chooser open, search results showing, and a filtered tree, in light and dark. |
| Keyboard | `accessibility.spec.mjs`, `cell-navigation.spec.mjs`, `keyboard-regressions.spec.mjs`, `menu-closing.spec.mjs` and the grid specs | The row and cell focus model, type-ahead, Tab leaving the grid, menus, and DOM order while scrolling. |
| Forced colours | `tests/browser/specs/accessibility-modes.spec.mjs` | With forced colours emulated in light and dark, on a tree, a flat grid and a reporting grid: selected rows resolve to `Highlight` and `HighlightText` with all their text in `HighlightText`, focus outlines are solid and at least 2 pixels, menus have edges and focused items an outline, pills and badges keep an outline, status dots stay visible, and the record drawer keeps its edge and focus outline. |
| Reduced motion | `accessibility-modes.spec.mjs` | With reduced motion emulated, no element of a view, menu or drawer has a running animation or a transition longer than zero. |
| Reflow | `accessibility-modes.spec.mjs` | At 640 x 512 and 320 x 256: no sideways page scrolling, no toolbar control outside the window, every control of the Columns menu reachable, and the record drawer inside the window and closable. |
| Target size | `accessibility-modes.spec.mjs` | On nine example pages at desktop and phone widths, every visible pointer target in a view meets 24 x 24 by size, hit area or spacing, and none is covered by another target; phone toolbars, pagers and header menus are 44 pixels tall, and the record drawer's buttons 44 by 44. |
| Screen readers | [screen-reader-test.md](screen-reader-test.md) | A manual NVDA and Narrator checklist. It has not been run for this version; spoken announcements are unverified. |

The browser tests run in Chromium by default (`CANOPYX_TEST_BROWSERS` adds Firefox and WebKit). Forced colours and reduced motion are emulated through Playwright's media emulation, which approximates the Windows high contrast palettes; check a real high contrast theme on Windows before relying on a specific colour.

Evidence captures of forced colours, 400% zoom and phone touch layouts, before and after this work, are kept outside the repository with the change that made them.
