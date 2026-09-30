# Screen-Reader Test Script

The browser tests check roles, states, focus, and DOM order; they cannot hear what a screen reader says. This script is the manual pass that closes that gap for the tree grid. Run it with NVDA on Firefox or Chrome, and with Narrator on Edge, before a release or after a change to the keyboard model, the ARIA attributes, or the labels. It takes about 20 minutes per reader.

## Setup

1. Build the examples: `./Build.ps1 -Configuration Release -SkipPack`.
2. Open `CanopyX.Examples/bin/Release/net10.0/output/inline.html` from disk, then `bundle/index.html` in the same folder.
3. NVDA: start it, set the verbosity to the default, and leave browse mode on when the page loads. Narrator: Ctrl+Win+Enter, scan mode on.
4. Keep a note per step: pass, or what was announced instead.

## Script

| # | Do | Expect to hear |
| --- | --- | --- |
| 1 | Press Tab from the page start until focus enters the grid. | The grid's name ("File shares"), "tree grid", then the first row: its label, "level 1", "1 of 4", expanded or collapsed. Focus mode switches on by itself (NVDA plays its focus-mode sound). |
| 2 | Press Down three times. | Each row's label with its level and position ("2 of 5"), and "collapsed" or "expanded" only on rows that have children. Nothing is announced twice. |
| 3 | On a collapsed folder, press Right, then Right again. | "expanded" after the first press; the first child row (level one deeper, "1 of n") after the second. |
| 4 | Press Left twice. | Back on the parent; then "collapsed". |
| 5 | Open a folder with more than 100 files and press End. | The "Show more" row: "Show more (100 of 240 loaded)". Its position does not claim a wrong total. |
| 6 | Press Enter on "Show more". | "200 of 240 loaded" from the live region, focus on the first newly loaded row. |
| 7 | Press Home, then type "leg" quickly. | Focus jumps to the row whose label starts with "Leg", and it is announced. |
| 8 | Press Enter, then wait a second and press Space. | "selected" after Enter (and "expanded" for a folder); "not selected" after Space (the example is multi-select). |
| 9 | Press Tab once. | Focus leaves the grid for the next control on the page. Shift+Tab returns to the same row. |
| 10 | Tab to the search box, type "budget", press Down twice, then Enter. | The result count ("20 of 4,698 results" in the bundle), each result as it is highlighted ("Budget 1.xlsx", its kind and path), then the chosen row in the grid, expanded to and selected. |
| 11 | Type a single letter in the bundle's search box. | "Type at least 2 characters". |
| 12 | Open a file's history and move onto a version's detail row (before/after table). | The row as one row; with the reader's table navigation (NVDA: Ctrl+Alt+arrows), the table's caption, headers, and cells. |
| 13 | Scroll the bundle's grid with the mouse wheel for a few seconds, then read the rows in browse mode (NVDA: Down arrow in browse mode; Narrator: Caps Lock+Right). | Rows in visual order, without gaps or repeats. |
| 14 | Print preview (Ctrl+P) with a few folders open. | The outline table of the open rows; not part of the reader pass, but check that nothing is missing. |

### Cell Navigation

Build a page whose rows have controls in their cells, for example the host renderers in `tests/browser/specs/cell-navigation.spec.mjs` (copy its view and `hostScript` into a page that loads `canopyx.js` and `canopyx.css`), or a report from the HtmlForgeX bridge with entity links.

| # | Do | Expect to hear |
| --- | --- | --- |
| 15 | On a row without children that has a button or a link in a cell, press Right. | The control ("State ok, button") and the column it is in ("State"). |
| 16 | Press Right, then Left, through the row. | Each cell or control in turn with its column header; on a cell without a control, the cell's text. Left from the first cell returns to the row, announced as a row again. |
| 17 | From a control, press Down. | The same column in the next row: its control when that is a button or a link, otherwise the cell's text, with the new row's context. |
| 18 | On an open folder row, press F2, then Escape. | The first control of the row; then the row again. |
| 19 | Move with Right onto a cell with a text box, press Enter, type, press Left and Right, then Escape. | Right stops on the cell (its column and value); Enter enters the text box ("edit"); the caret moves in it and the grid does not; Escape announces the cell again. |
| 20 | Press Tab from a cell's control, then Shift+Tab twice. Enter the cells again and press Shift+Tab from a control. | Tab leaves the grid: the controls in cells are not Tab stops. The first Shift+Tab returns to the grid's row, the second leaves the grid backwards. Shift+Tab from a control also leaves the grid at once, without announcing its row. |
| 21 | On a detail row with a button, press Right. | The button inside the detail; Left returns to the detail row. On a detail whose content scrolls, Right past the last control announces the scrolling region, and Down scrolls it. |

### Translated Labels

Repeat steps 5, 6, 10, and 11 on a page whose view carries Polish labels (see the view in `tests/browser/specs/labels.spec.mjs`), and check that every announcement is in Polish, including numbers formatted for the page language.

## Reporting

Record the reader, its version, the browser and its version, and every step that did not pass, with what was announced. Open an issue for each failure, or add it to the screen-reader item in `TODO.md`.
