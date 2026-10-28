# Board view

A board shows the records of a flat grid as cards in lanes. The lane column holds raw values such as status, owner or stage. An optional second column supplies swimlanes. Search, facets, saved views and the record panel use the grid's existing contracts.

## C# authoring

```csharp
using CanopyX;
using CanopyX.Html;

var view = new CanopyDataGridView("requests", "Requests");
view.Columns.Add(new CanopyColumn("title", "Request") { RowHeader = true });
view.Columns.Add(new CanopyColumn("status", "Status") { Editable = true });
view.Columns.Add(new CanopyColumn("team", "Team"));
view.Board = new CanopyBoard("status") {
    TitleColumn = "title", SwimlaneColumn = "team", Editable = true
};
view.Board.Lanes.Add(new CanopyBoardLane("ready", "Ready"));
view.Board.Lanes.Add(new CanopyBoardLane("active", "In progress") { WipLimit = 4 });
view.Board.Lanes.Add(new CanopyBoardLane("done", "Done"));
view.Board.Fields.Add("team");
view.Rows.Add(new CanopyGridRow("review-1") {
    Cells = { ["title"] = "Review the migration plan", ["status"] = "ready", ["team"] = "Operations" }
});
view.SaveHtmlPage("requests.html");
var email = view.ToBoardStaticHtml();
```

Lanes retain the declared order. Other values in records add lanes after them. Values keep their scalar types: `true` and `"true"` identify different lanes, as do null and an empty string. Missing values join the null lane. Up to 200 lane definitions and eight card fields can be authored. Compact cards display the first two fields; the record panel carries the full record. A missing title column uses the row header, then the first visible column.

Titles wrap to two lines and card slots measure the rendered title, fields and move control through the shared spacing roles. Keyboard help is available as the cards' accessible description. For text workflows, set the lane column's `ValueLabels` and `ValueOrder` to the lane labels and raw values in the same order. The existing facet and cell formatters then show human labels consistently; raw values remain stable for filtering and proposals. `BoardExample` demonstrates this mapping.

Boards use continuous offset navigation. Paged and cursor grids and a calendar on the same definition are rejected. Hosted boards read ordinary `gridQuery` pages at the accepted revision, up to 100,000 matching records, and disclose a partial result when that bound is reached. They work with the existing `CanopyX.Data` offset query source; no separate database or board query engine is needed.

## Governed moves

Drag a card to another lane, choose its lane control, or focus the card and press Alt+Left or Alt+Right. The lane column must be editable and record keys must be stable. The grid's read-only and `isEditable` settings still apply.

A move raises `canopyx:boardMove` and the optional `onBoardMove` callback. Its detail contains the record id, column, previous and proposed raw values, and a `gridCommit` proposal. A listener can answer once through `detail.respondWith(true | false | promise)`. A callback can return the same boolean answer. Without an answer or a configured editing writer, the record stays in its original lane.

```javascript
import { createDataGrid } from "@evotecit/canopyx/grid";

const api = createDataGrid(host, {
  view,
  editing: {
    // The application authorizes and persists the ordinary gridCommit.
    commit: (proposal, context) => saveChanges(proposal, context)
  }
});
await api.ready;
```

After approval, the normal editing contract rechecks current record permissions, validates and commits the lane cell. A rejected writer restores the original lane. An outstanding edit on that record prevents a board move from overwriting it. A host answer from an earlier query or live row update cannot change the current result. Shared live transactions and source refreshes update cards, lane membership and WIP counts. CanopyX performs no application writes itself.

WIP limits prevent additional moves into a full lane. Existing over-limit data remains visible and records can move out. For inline data, WIP counts cover the whole dataset, including records hidden by a search or facet. Hosted counts cover the returned snapshot; the host must check its authoritative limit again when committing.

## Phones, keyboard and print

At widths up to 640 px, a lane picker shows one lane at a time. The chosen lane joins saved-view state as `board.lane`, together with the ordinary grid query and column preferences. Up and Down move focus through cards in the current lane; Enter opens the shared record panel. Every lane scrolls and virtualizes independently, including its swimlane headings.

Browser print materializes the matching cards before printing and restores virtualization afterwards. `ToBoardStaticHtml()` writes script-free lanes and cards with inline styles for email, print and Word. A hosted fallback requires an accepted result page. The static row budget and partial-result disclosure apply across all lanes.

The `board` script and stylesheet load through the [part API](plugins.md). Ordinary grids do not load them. English labels have matching Polish, German, Spanish, French and Italian packs.
