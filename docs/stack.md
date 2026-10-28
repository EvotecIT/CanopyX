# Stack view

A stack explains an ordered set of configuration layers and the result selected
by a host. The host supplies the order, one winner, each layer's reason, and any
enforced or filtered states. CanopyX displays this explanation without evaluating
precedence, scope, configuration rules or other domain facts.

Set `CanopyDataGridView.Stack` to a parameterless `CanopyStack`. Add layers to
`Layers` in processing order. Each `CanopyStackLayer(id, record, reason)` has a
unique layer id and refers to an existing stable inline grid record. Several
layers may refer to the same record with different reasons and context labels.

```csharp
var view = new CanopyDataGridView("configuration", "Configuration layers") {
    Stack = new CanopyStack()
};
view.Columns.Add(new CanopyColumn("name", "Configuration") { RowHeader = true });
view.Rows.Add(new CanopyGridRow("shared") { Cells = { ["name"] = "Shared defaults" } });
view.Rows.Add(new CanopyGridRow("session") { Cells = { ["name"] = "Session configuration" } });
view.Stack.Layers.Add(new CanopyStackLayer("baseline", "shared", "Provides the starting value."));
view.Stack.Layers.Add(new CanopyStackLayer("effective", "session", "Selected by the host for this session.") {
    Winner = true, Badges = { new CanopyBadge("Reviewed", CanopyTone.Info) }
});
```

`TitleColumn` is optional. It defaults to a row-header column, then the first
visible column. An explicit title column must exist. `Label` adds context beside
the record name; `Reason` is required and cannot be blank. `Winner`, `Enforced`
and `Filtered` are independent host-supplied flags, except that a filtered layer
cannot win. A nonempty stack requires exactly one winner. An empty stack displays
an explicit empty state. A stack accepts at most 1,000 layers and uses inline
records with stable ids.

Stack settings and layers reject unknown properties. Layer badges use the shared
`text`, optional `tone`, and optional `title` wire fields.

The additive `canopyx/2` grid field is:

```json
{
  "stack": {
    "titleColumn": "name",
    "layers": [
      { "id": "baseline", "record": "shared", "reason": "Provides the starting value." },
      { "id": "effective", "record": "session", "reason": "Selected by the host for this session.", "winner": true,
        "badges": [{ "text": "Reviewed", "tone": "info" }] }
    ]
  }
}
```

The optional `stack` browser part displays a compact winning-result summary and
a numbered list of all layers. Record names open the existing record panel.
Tab reaches the record buttons; Up, Down, Home and End move between layer
buttons. Enter and Space open the record. Filtered layers remain readable with
their reasons. Narrow screens retain the same vertical processing order.

Layer order and the winner describe the host's complete explanation. Grid search,
sorting and query windows do not recalculate or remove stack layers. A host that
needs a different explanation supplies a new stack definition. Inline record
lookup also opens records outside the grid's loaded window.

`CanopyStaticHtml.RenderGrid` renders the same explanation with inline styles and
no script. `MaxRows` limits the number of layer entries, counting repeated record
references separately. If the winner falls beyond the visible prefix, it takes
the final available slot; retained entries preserve their original order and
numbers. A layer-specific overflow note explains the truncation and uses the
shared full-report link handling. The winning summary stays visible.

`RenderGridWithResult` captures one row per displayed layer: processing position,
record title, context label, reason, state labels, and badge text. `TotalRows`
counts layers, and `IsComplete` is false when the row budget omits layers. Browser
print output includes every layer in order.

The presentation shows the complete supplied explanation. The ordinary grid query toolbar is hidden; searching or filtering the underlying grid does not remove layers or change the host-supplied winner.
