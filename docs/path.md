# Path view

A path shows explicit source-to-target chains over a grid's existing records.
Use it for approval routes, handovers, or another ordered sequence that the host
already knows. CanopyX does not discover relationships, infer cycles, or decide
whether a step crosses a boundary.

```csharp
var view = new CanopyDataGridView("approval", "Approval route") {
    Search = false,
    Record = new CanopyRecordPanel(),
    Path = new CanopyPath()
};
view.Columns.Add(new CanopyColumn("title", "Step") { RowHeader = true });
view.Rows.Add(new CanopyGridRow("request") { Cells = { ["title"] = "Submit request" } });
view.Rows.Add(new CanopyGridRow("review") { Cells = { ["title"] = "Review request" } });

var route = new CanopyPathChain("standard", "Standard approval");
route.Hops.Add(new CanopyPathHop("request"));
route.Hops.Add(new CanopyPathHop("review", "Receiving team review") {
    Flags = { CanopyPathFlag.Foreign },
    Badges = { new CanopyBadge("Two reviewers", CanopyTone.Info) }
});
view.Path.Chains.Add(route);
```

`TitleColumn` selects the record title. Its default is the row-header column,
then the first visible column. A hop's optional `Label` explains that occurrence;
it does not replace the record title. Clicking a title, or pressing Enter or
Space on it, opens the existing grid record panel. Tab follows document order;
arrow keys move within a chain, and Home and End reach its endpoints. Long
titles wrap. Desktop chains read horizontally; phone chains read vertically.

`Cycle`, `Foreign`, and `Disabled` are host annotations with visible text tokens.
They never change records or execute actions. A disabled step remains readable
in the record panel. The same record may occur more than once, within or across
chains; each occurrence keeps its own label, flags, and badges. Chains retain
the order supplied by the host rather than deriving routes from grid sorting or
search. Hosts choose which chains to supply.

The source must be inline and identities must be stable. Every hop must refer
to an existing record, and an explicit title column must exist. The bounds are
200 chains, one to 256 hops per chain, and 10,000 hop occurrences in total. An
empty path is valid. Chain identities are unique, nonblank strings of at most
256 characters. Chain and hop labels are nonblank strings of at most 4,096
characters. Each hop accepts distinct flags and up to 16 badges. Badge text is
at most 256 characters and an optional title is at most 4,096. Path text must
contain well-formed Unicode and no control characters.

The additive `canopyx/2` field uses record references instead of duplicating cells:

```json
{
  "path": {
    "titleColumn": "title",
    "chains": [
      {
        "id": "standard",
        "label": "Standard approval",
        "hops": [
          { "record": "request" },
          {
            "record": "review",
            "label": "Receiving team review",
            "flags": ["foreign"],
            "badges": [{ "text": "Two reviewers", "tone": "info" }]
          }
        ]
      }
    ]
  }
}
```

`CanopyStaticHtml.RenderGrid(view)` renders the path as script-free ordered
lists with inline styles for email and print. Static row limits count hop
occurrences, including repeated records, and an overflow note identifies an
incomplete path. An accepted page snapshot must contain every record of a chain
for that chain to render; omitted steps are never spliced into a different
route. `CanopyStaticHtmlResult.Rows` captures one text cell per shown occurrence
and `TotalRows` counts the path's configured occurrences. Browser print includes
all bounded hops using normal print styles, without a `beforeprint` event.

The presentation keeps every supplied chain intact. The ordinary grid query toolbar is hidden; searching or filtering the underlying records does not remove intermediate steps.
