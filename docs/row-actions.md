# Row Actions

A flat grid can put actions on every row: a Run button on idle jobs, Pause on running ones, and Edit and Delete in a More
menu. CanopyX shows the buttons and raises a proposal when the reader picks one; your code decides and does the work.
CanopyX never carries an action out, exactly as with a tree's [context actions](authoring.md#host-actions-editing-and-moving-nodes).

The `row-actions.html` example (and `-dark.html`) is a job list whose actions change with each job's state, with a mock
scheduler that accepts most actions after a short delay and refuses some with its own message.

## Declaring the actions

```csharp
var running = CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Running");
grid.RowActions.Inline = 1;
grid.RowActions.LockedWhen = CanopyFormatCondition.Where("owner", CanopyFormatOperator.Equal, "System");
grid.RowActions
    .Add(new CanopyRowAction("run", "Run now", CanopyRowActionIcon.Play) {
        Tone = CanopyRowActionTone.Primary,
        When = CanopyFormatCondition.Where("status", CanopyFormatOperator.NotEqual, "Running")
    })
    .Add(new CanopyRowAction("pause", "Pause", CanopyRowActionIcon.Pause) { When = running })
    .Add(new CanopyRowAction("edit", "Edit", CanopyRowActionIcon.Edit))
    .Add(new CanopyRowAction("delete", "Delete", CanopyRowActionIcon.Delete) {
        Tone = CanopyRowActionTone.Danger, DisabledWhen = running, DisabledReason = "Pause the job before deleting it."
    });
```

In the document it is the grid's `rowActions` ([protocol](data-protocol.md#flat-grid-row-actions)):

```json
"rowActions": {
  "inline": 1,
  "lockedWhen": { "operator": "and", "filters": [{ "column": "owner", "operator": "eq", "values": ["System"] }], "groups": [] },
  "actions": [
    { "id": "run", "label": "Run now", "icon": "play", "tone": "primary",
      "when": { "operator": "and", "filters": [{ "column": "status", "operator": "ne", "values": ["Running"] }], "groups": [] } },
    { "id": "delete", "label": "Delete", "icon": "delete", "tone": "danger", "disabledReason": "Pause the job before deleting it.",
      "disabledWhen": { "operator": "and", "filters": [{ "column": "status", "operator": "eq", "values": ["Running"] }], "groups": [] } }
  ]
}
```

| Setting | Meaning |
| --- | --- |
| `actions` | 1 to 16 actions in their order, each with an `id`, a `label` (the button's accessible name and tooltip, and the menu text), an `icon` and a `tone` (`neutral`, `primary` or `danger`). |
| `when` | The rows that offer the action. Without it every row that is not locked does. |
| `disabledWhen`, `disabledReason` | The rows on which the action shows but cannot run, and why: the reason is the button's description and tooltip. |
| `refresh` | After you accept, the grid reads its rows again: `refreshRows()` on a [live](live-data.md) grid, otherwise `reload()`. |
| `inline` | How many actions show as buttons, 0 to 4 (default 2). The rest go into the More menu; when only one would be left over it shows as a button instead. |
| `reveal` | `always` (default), or `hover` to show the buttons on the hovered, focused, selected or busy row. |
| `pin` | `right` (default) keeps the column at the end edge while the grid scrolls sideways; `none` lets it scroll. |
| `lockedWhen`, `lockedLabel` | Rows that show a lock and no actions, such as the system's own records, and the lock's name (default "Read-only"). |

Conditions are [conditional formatting's conditions](conditional-formatting.md#conditions): every filter group is one, and
they read the row's declared columns. The icons are `check` (default), `play`, `pause`, `stop`, `retry`, `edit`, `delete`,
`copy`, `open`, `close` and `download`.

The actions column belongs to the grid, not to your data: it has the id `cx-row-actions`, which your columns cannot use, and
sources, queries, sorting, filters, exports, printing, the record drawer and the [static renderer](authoring.md) leave it
out. Readers can still hide it from the Columns menu. A grid with row actions loads the `row-actions` part (about 8.5 KB
gzip, with the shared menu) with its first query; single-file pages carry it automatically.

## Answering a proposal

```js
CanopyX.configure("jobs", {
  async onRowAction(proposal, request) {
    // proposal: { id, action, row }, frozen. request: { signal, reason, query, revision }.
    const answer = await scheduler.run(proposal.id, proposal.action, { signal: request.signal });
    if (!answer.ok) return { accepted: false, message: answer.reason };
    grid.updateRows([{ id: proposal.id, cells: { status: answer.status } }]);
    return true;
  },
  isRowActionEnabled: (row, action) => action.id !== "delete" || user.canDelete
});
```

`onRowAction` answers `true` or `false`, `{ accepted, message }`, or a promise of either. While it works, the row's
buttons are busy (`aria-busy`, a turning ring) and the grid's live region says "Run now: working". Other rows stay free:
each row has one proposal at a time. When you refuse, the message (or "Run now was not carried out.") shows on a status
line above the rows that a screen reader announces, and the button is marked until the next action; an exception or the
deadline shows as a failure. When you accept, the live region says "Run now: done".

Update the data yourself: through the [live data](live-data.md) API as above, by returning and letting `refresh` reload the
rows, or from your server. `isRowActionEnabled` is a synchronous per-row check that disables a button; your hook still
authorizes the action.

| API | Meaning |
| --- | --- |
| `requestRowAction(id, action, { signal?, reason? })` | Raises an action of a loaded row as if it were picked; resolves with your answer, or `false` when the row, the action or the hook is not available, the action is disabled, or the row already has a proposal. |
| `cancelRowAction(id?)` | Aborts the proposal of a row, or of every row. Your hook's `signal` aborts. |
| `canopyx:beforeRowAction` (cancelable), `onBeforeRowAction` | Before the hook, with the proposal; cancel or return `false` to veto. |
| `canopyx:rowAction` | After the answer: `{ proposal, accepted, reason, message }`. |
| `interactionTimeoutMs` | The deadline of a proposal, 30 seconds by default. |

The labels are `rowActionColumn`, `rowActionMore`, `rowActionLocked`, `rowActionDismiss`,
`rowActionPending`, `rowActionDone`, `rowActionRejected` and `rowActionFailed` ([labels](labels.md)).

## Keyboard, screen readers and touch

The actions cell takes part in [cell navigation](accessibility.md): the grid stays one Tab stop, Left and Right reach the
cell like any other, Enter on the cell moves onto its first button, Left and Right then move between the buttons, and
Enter or Space activates one. Escape returns to the row.
Each cell is a labelled group of labelled buttons; a disabled action keeps its button, marked `aria-disabled` with its
reason as the description, so the keyboard still finds it. More is a menu button: Enter, Space or Down opens the shared
menu, the arrow keys move in it and Escape returns to the button. A right click, Shift+F10, the Menu key or a long press on a
row opens the same menu with all of the row's actions.

With `reveal: "hover"` the buttons fade in on the hovered, focused, selected or busy row; they stay reachable from the
keyboard on every row, and touch screens, which cannot hover, always show them. On phones the column keeps its place at
the end of each card. Right to left, the column pins to the left edge and the arrow keys follow the reading direction.

## Limits

- One proposal per row at a time; a second action on the same row waits until the first is answered.
- A pending proposal survives sorting, filtering and reloads; cancel it with `cancelRowAction` when your data makes it moot.
- Row actions are for flat grids. Trees use [context actions](authoring.md#host-actions-editing-and-moving-nodes).
