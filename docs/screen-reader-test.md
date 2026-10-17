# Screen-Reader Test Checklist

The browser tests check roles, states, focus, keyboard behaviour and DOM order; they cannot hear what a screen reader says. This checklist is the manual pass that closes that gap, for trees, flat grids, their menus and the record drawer. Run it with **NVDA** and with **Narrator** before a release, or after a change to the keyboard model, the ARIA attributes, the labels or the menus. Each reader takes about 30 minutes.

**Status:** not run for this version. Spoken announcements are unverified until a filled-in record (below) is attached to the release.

## Before you start

1. Build the examples: `./Build.ps1 -Configuration Release -SkipPack`. The pages are in `CanopyX.Examples/bin/Release/net10.0/output/`.
2. Open the pages from disk, in this order: `inline.html` (a tree), `bundle/index.html` (a large tree with search), `rich-grid.html` (a flat grid), `reporting-grid.html` (a reporting grid with grouping, the column menu and record details), `checkboxes.html` (checkboxes).
3. Copy the record template at the end of this page and fill in the header: reader and version, browser and version, Windows version, date, and who ran it.

### NVDA

- Use NVDA 2024.1 or later with Firefox or Chrome. Leave the speech settings at their defaults (punctuation level "some", report tables on).
- Turn on the speech viewer (NVDA menu, Tools, Speech Viewer) so you can copy what was said into the record.
- Leave browse mode on when the page loads. NVDA switches to focus mode by itself when focus enters a grid; it plays its focus-mode sound.

### Narrator

- Use Narrator on Windows 11 with Edge. Start it with Ctrl+Win+Enter.
- Scan mode is on by default for web pages (Caps Lock+Space toggles it). Narrator leaves scan mode by itself when focus enters a grid.
- Turn on "Show Narrator's speech" or the Narrator developer mode only if you need to copy announcements.

Both readers: keep the default verbosity. Where a step says "row", the reader should announce the row's cells or its label, not "clickable" or "group" alone. For every step, write **pass**, or what was announced instead.

## Trees (`inline.html`, then `bundle/index.html`)

| # | Do | Expect to hear | NVDA | Narrator |
| --- | --- | --- | --- | --- |
| T1 | Press Tab from the page start until focus enters the grid. | The grid's name ("File shares"), "tree grid", then the first row: its label, "level 1", "1 of 4", expanded or collapsed. | | |
| T2 | Press Down three times. | Each row's label with its level and position ("2 of 5"), and "collapsed" or "expanded" only on rows that have children. Nothing is announced twice. | | |
| T3 | On a collapsed folder, press Right, then Right again. | "expanded" after the first press; the first child row (one level deeper, "1 of n") after the second. | | |
| T4 | Press Left twice. | Back on the parent; then "collapsed". | | |
| T5 | Open a folder with more than 100 files and press End. | The "Show more" row: "Show more (100 of 240 loaded)". Its position does not claim a wrong total. | | |
| T6 | Press Enter on "Show more". | "200 of 240 loaded" from the live region, then the first newly loaded row. | | |
| T7 | Press Home, then type "leg" quickly. | Focus jumps to the row whose label starts with "Leg", and it is announced. | | |
| T8 | Press Enter, wait a second, then press Space. | "selected" after Enter (and "expanded" for a folder); "not selected" after Space (the example is multi-select). | | |
| T9 | Press Tab once, then Shift+Tab. | Tab leaves the grid for the next control on the page; Shift+Tab returns to the same row. | | |
| T10 | Tab to the search box, type "budget", press Down twice, then Enter. | The result count ("20 of 4,698 results" in the bundle), each highlighted result ("Budget 1.xlsx", its kind and path), then the chosen row in the grid, expanded to and selected. | | |
| T11 | In the bundle's search box, type a single letter. | "Type at least 2 characters". | | |
| T12 | Open a file's history and move onto a version's detail row (before and after table). | The row as one row; with table navigation (NVDA: Ctrl+Alt+arrows; Narrator: Ctrl+Alt+arrows in scan mode), the caption, headers and cells. | | |
| T13 | Scroll the bundle's grid with the mouse wheel for a few seconds, then read the rows in browse or scan mode (NVDA: Down arrow; Narrator: Caps Lock+Right). | Rows in visual order, without gaps or repeats. | | |
| T14 | On a column header, press Enter on the sort button, then again. | The column name with "sorted ascending", then "sorted descending". | | |

## Toolbar menus and the record drawer (`inline.html`, `reporting-grid.html`)

| # | Do | Expect to hear | NVDA | Narrator |
| --- | --- | --- | --- | --- |
| M1 | Tab to the Columns button and press Enter. | "Columns", button, expanded (or "menu" / "dialog" with its name); focus moves into the list. | | |
| M2 | Move through the column list with Tab or the arrow keys, and press Space on one. | Each column as a checkbox with its name and "checked" or "not checked"; Space toggles it and announces the new state. Hidden-at-this-width notes are read with their column. | | |
| M3 | Press Escape. | The menu closes and focus is back on the Columns button, announced again. | | |
| M4 | Open the Export menu, move to "Download CSV" and back, then press Escape. | The scope list as a combo box with its value, each action as a button, and focus back on Export after Escape. | | |
| M5 | Open the More menu. | Each entry as a menu item with its name; Down and Up move between them, Home and End go to the ends. | | |
| M6 | In the reporting grid, open a column's menu (the header's menu button) and move through it. | "Menu for" and the column name, then each entry (Sort ascending, Sort descending, Filter, Pin left, Fit to content, Hide column) as a menu item; disabled entries are announced as unavailable. | | |
| M7 | Focus a row and press Enter. | The record drawer opens as a dialog named after the record; its fields are read as term and value pairs. | | |
| M8 | Press the Next record button, then Escape. | The next record's name; after Escape the drawer closes and focus returns to the row it was opened from, announced as a row. | | |

## Flat grids (`rich-grid.html`, `reporting-grid.html`)

| # | Do | Expect to hear | NVDA | Narrator |
| --- | --- | --- | --- | --- |
| G1 | Tab into the grid. | The grid's name, "grid" (or "table"), the row and column count, then the first row with its cells. | | |
| G2 | Press Down twice, then Page Down. | Each row with its position ("row 3 of 138") and cells; Page Down announces a row a page further. | | |
| G3 | Press F2, then Right three times. | The first cell with its column header; each next cell with its header and value; a link cell as a link with its name. | | |
| G4 | Press Escape, then Ctrl+End and Ctrl+Home. | Back on the row; then the last row and the first row. | | |
| G5 | Press Space, then Down and Space again. | "selected" for each row; the toolbar's selection count ("2 selected") is announced by the live region or when you Tab to it. | | |
| G6 | In the reporting grid, collapse and expand a group row with Enter. | The group row with its label and count, and "collapsed" or "expanded". | | |
| G7 | Tab to the pager, change the page with Next page. | The pager buttons by name ("Next page"), the page number field with its value, and the new range ("26–50 of 137 rows"). | | |

## Checkboxes (`checkboxes.html`)

| # | Do | Expect to hear | NVDA | Narrator |
| --- | --- | --- | --- | --- |
| C1 | Focus a row and press Space on its checkbox (or the checkbox key the example lists). | The row, then "checked", "not checked" or "partially checked" for a parent with mixed children. | | |
| C2 | Check a parent whose children are only partly loaded. | The parent's new state, and the children's states as they are read. | | |

## Cell navigation with host controls

Build a page whose rows have controls in their cells, for example the host renderers in `tests/browser/specs/cell-navigation.spec.mjs` (copy its view and `hostScript` into a page that loads `canopyx.js` and `canopyx.css`), or a report from the HtmlForgeX bridge with entity links.

| # | Do | Expect to hear | NVDA | Narrator |
| --- | --- | --- | --- | --- |
| H1 | On a row without children that has a button or a link in a cell, press Right. | The control ("State ok, button") and the column it is in ("State"). | | |
| H2 | Press Right, then Left, through the row. | Each cell or control in turn with its column header; on a cell without a control, the cell's text. Left from the first cell returns to the row, announced as a row again. | | |
| H3 | From a control, press Down. | The same column in the next row: its control when that is a button or a link, otherwise the cell's text, with the new row's context. | | |
| H4 | On an open folder row, press F2, then Escape. | The first control of the row; then the row again. | | |
| H5 | Move with Right onto a cell with a text box, press Enter, type, press Left and Right, then Escape. | Right stops on the cell (its column and value); Enter enters the text box ("edit"); the caret moves in it and the grid does not; Escape announces the cell again. | | |
| H6 | Press Tab from a cell's control, then Shift+Tab twice. Enter the cells again and press Shift+Tab from a control. | Tab leaves the grid: the controls in cells are not Tab stops. The first Shift+Tab returns to the grid's row, the second leaves the grid backwards. Shift+Tab from a control also leaves the grid at once, without announcing its row. | | |
| H7 | On a detail row with a button, press Right. | The button inside the detail; Left returns to the detail row. On a detail whose content scrolls, Right past the last control announces the scrolling region, and Down scrolls it. | | |

## Translated labels

Repeat T5, T6, T10 and T11, and M1 to M3, on a page whose view carries Polish labels (`localized-tree-pl.html`, or the view in `tests/browser/specs/labels.spec.mjs`), and check that every announcement is in Polish, including numbers formatted for the page language.

## Display modes (optional)

With Windows high contrast on (Settings, Accessibility, Contrast themes), repeat T1 to T4 and M1 to M3 with the reader running, and note anything the reader or the eye misses: the selected row should be drawn in the system highlight colour and the focused row should have a visible outline.

## Record template

```text
Reader and version:
Browser and version:
Windows version:
Date and tester:

Step   Result (pass, or what was announced instead)
T1
T2
…
Notes:
```

Open an issue for each failure, quoting the step and what was announced, or add it to the screen-reader item in `TODO.md`. Attach the filled-in record to the release notes; until then, the release states that the screen-reader pass was not run.
