# Search-hit highlighting

A view with `searchHighlight` marks what the reader searched for inside its cells: quick-search text, the values a flat
grid's column filters match, and the search box's words in a tree's nodes. Each hit is a `<mark>` element, so assistive
technology and the browser's own find treat it as marked text. The search box shows a live match count ("12 matches", then
"3 of 12" while moving through them) with Previous and Next buttons, and the more menu has a **Highlight matches** switch
whose state saved views keep.

## Turn it on

```csharp
var view = new CanopyDataGridView("support-tickets", "Support tickets") { Noun = "tickets" };
view.SearchHighlight = new CanopySearchHighlight { IgnoreAccents = true };
view.SearchHighlight.FilterTones["status"] = "info";   // filter hits in the Status column use the info tone
```

```js
createDataGrid(host, { view: { ...view, searchHighlight: { ignoreAccents: true, filterTones: { status: "info" } } } });
```

`searchHighlight: true` uses every default. Trees take the same option (`CanopyTreeView.SearchHighlight`).

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Marks are shown when the view opens. The reader's switch, and a saved view, can change it. |
| `search` | `true` | Mark quick-search text. |
| `filters` | `true` | Mark the values a flat grid's column filters match, styled apart from search hits. |
| `matchCase` | `false` | Compare case exactly when marking. Off, marking folds case the way search does. |
| `ignoreAccents` | `false` | A letter with accents matches its base letter when marking: `cafe` marks `Café`. Also `ł`, `ø`, `đ` and similar letters match `l`, `o`, `d`. |
| `minLength` | `1` | The shortest term (1 to 32 characters) that is marked. |
| `filterTones` | none | A tone (`info`, `success`, `warning`, `danger` or a host tone) per column id for that column's filter hits. |

`matchCase` and `ignoreAccents` change what is marked, never which rows match: the rows still follow the view's search
rules ([data protocol](data-protocol.md#flat-grid-documents)), which fold case and keep accents distinct.

## What is marked

- **Quick search.** The grid's search mode decides the terms: the whole text in `substring` mode, each word and quoted phrase
  in `words` mode. A grid with `searchColumns` marks only those columns. A tree marks the search box's words at the start of
  words in the tree column, as tree search matches them.
- **Column filters (flat grids).** `contains` and `starts with` conditions mark the matching text in their column. Value
  conditions (`equals`, `is any of`, `greater than`, `less than` and their inclusive forms) mark the whole value of a cell
  that meets them. `not equal`, `is missing` and `is present` mark nothing. Conditions inside filter groups count one by one.
- **The record drawer** of a flat grid marks its values the same way, for the record it shows.

Only text is marked. Links, pills, chips, icons, badges, buttons and host controls keep their markup; a link with a hit keeps
its address and stays a link. Columns a host renderer draws are not marked or counted, and a host can keep any element of its
own out of the marks with a `data-cx-no-highlight` attribute. Each row is unmarked before it is painted again, so recycled rows never show another row's
marks, and only the rows a view paints are marked, whatever the size of the result.

## The count and navigation

A match is one hit in a shown cell, in the text the view formats for that cell (host-drawn cells may show other text).
An inline grid counts its whole result, a tree its visible rows (again whenever they change), and a grid with a host source
the rows it has loaded ("12 matches in loaded rows" until every row is loaded; pages that arrive as the reader scrolls are
counted as they come, and a source that cannot count its result stays "in loaded rows"). Counting runs in slices of a few milliseconds between frames, so
typing and scrolling stay smooth: on 100,000 rows the marks of the painted rows appear with the query and the count
follows within a fraction of a second.

| Action | Effect |
| --- | --- |
| **Next** / **Previous** buttons, `F3` / `Shift+F3` anywhere in the view | Move to the next or previous match, scroll its row into view (loading it if needed) and focus its cell. |
| `Enter` / `Shift+Enter` in the search box, once the search is applied | Move to the next or previous match and keep typing focus in the box; the match's row becomes the grid's focused row. |
| No current match yet | Next starts at the focused row (or, on a flat grid, the first row in view), Previous before it. Both wrap at either end. |

The current match is marked more strongly and announced through the view's live region ("Match 3 of 12, Subject"); a
presenter that shows only part of a value (the first tags of a list) rings the cell instead when the match is in the part it
leaves out. The current match belongs to its record, so it stays current when a tree expands above it or a paged grid turns
the page. A new result (search, filters or sort) starts again from no current match. The settled count is announced once
typing pauses; the count in the search box is not a live region, so counting never floods a screen reader.

## API

| Member | Meaning |
| --- | --- |
| `getMatches()` | `{ enabled, total, current, complete }`: the count, the 1-based current match (0 for none), and whether the count covers the whole result. |
| `nextMatch({ focus })`, `previousMatch({ focus })` | Move to a match; `focus: false` leaves focus where it is. Resolve to `false` when nothing matches. |
| `setSearchHighlight(enabled)` | The Highlight matches switch. |
| `canopyx:matches` event | `{ total, current, complete }` after each count and each move. |

The methods reject on a view that does not declare `searchHighlight`. `toolbar.matches: false` (`Toolbar.Matches = false`)
leaves the navigator and the switch out; the API keeps working. The saved state carries the switch as `highlight`.

## Styling

Search hits, filter hits and the current match have their own tokens, derived from the tones so the light and dark palettes
and host themes follow:

| Token | Default |
| --- | --- |
| `--cx-hit-search-bg` | the warning tone mixed into the surface |
| `--cx-hit-filter-bg` | the info tone mixed into the surface, with an underline |
| `--cx-hit-current-bg`, `--cx-hit-current-ring` | a stronger warning mix and the accent ring (dark palettes use a bright fill with dark text) |
| `--cx-hit-text` | the text colour |

In forced colours (Windows high contrast) search hits use the system `Mark` colours, filter hits an underline and the
current match a `Highlight` outline. Printing leaves the marks out.

## Loading

The marking, the count, the navigator and their styles come with the `highlight` part (`canopyx-highlight.js` and `.css`),
which loads when a view declares `searchHighlight` (or the API first asks for it). Single-file pages carry it only when a
view declares the feature; hosts serve the files beside the runtime like the other parts ([plugins](plugins.md#parts)).
