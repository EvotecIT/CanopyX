# Editing flat grids

A flat grid can let readers change cell values: typed editors in the cells (or in the record drawer on phones), checks with
inline messages, a change set with changed-cell marks, undo and redo, and commits that hand the changes to the host. CanopyX
never writes data itself. Edits stay in the grid until the host saves them and confirms each row; the host authorizes and
executes every change it receives.

Editing ships as the `editing` part (`canopyx-editing.js` and `canopyx-editing.css`, see [Plugins and Parts](plugins.md)).
A grid with an editable column loads it with its first query; the grid entry points keep only the hooks.

## Making columns editable

Columns opt in with `editable`. Each chooses a typed `editor` (the column's kind chooses one otherwise) and optional
`validation`.

```csharp
var view = new CanopyDataGridView("assets", "Asset register") { TimeZone = CanopyTimeZone.Utc };
view.Columns.Add(new CanopyColumn("tag", "Asset tag") { Editable = true,
    Validation = new CanopyCellValidation { Required = true, Pattern = "[A-Z]{2}-\\d{4}" } });
view.Columns.Add(new CanopyColumn("cost", "Cost") { Kind = CanopyColumnKind.Number, Editable = true,
    Editor = CanopyCellEditor.Number(minimum: 0, maximum: 100000, step: 0.01) });
view.Columns.Add(new CanopyColumn("purchased", "Purchased") { Kind = CanopyColumnKind.DateTime, Editable = true, Editor = CanopyCellEditor.Date() });
view.Columns.Add(new CanopyColumn("status", "Status") { Editable = true, Editor = CanopyCellEditor.Select("In use", "In stock", "Repair") });
view.Columns.Add(new CanopyColumn("insured", "Insured") { Editable = true, Editor = CanopyCellEditor.Toggle() });
view.Columns.Add(new CanopyColumn("owner", "Owner") { Editable = true, Editor = CanopyCellEditor.Lookup() });
view.Editing.Mode = CanopyGridEditMode.Cell;     // or Row
```

The view document carries the same definitions:

```json
{ "id": "cost", "title": "Cost", "kind": "number", "editable": true,
  "editor": { "type": "number", "min": 0, "max": 100000, "step": 0.01 },
  "validation": { "required": true } }
```

`editor` may be a name alone (`"editor": "date"`). The grid's `editing` object (C# `CanopyDataGridView.Editing`) sets
`readOnly`, `mode` (`cell` or `row`), `drawer` (`phone`, `always` or `never`) and `editBar`.

**How `editable` relates to trees.** The same `CanopyColumn.Editable` flag has always made a tree column editable in the
interactive tree runtime, where each change is one proposal to the host's `onEdit` hook. Trees keep that behaviour. In a flat
grid the flag now loads the editing part described here; typed editors and validation apply to flat grids only (a tree
column with an `Editor` or `Validation` is rejected).

## Editors

| Type | Column kinds | What it does |
| --- | --- | --- |
| `text` | text (default) | A text box. |
| `number` | number (default) | A text box that reads numbers as the page language writes them (`1 234,5` in Polish, `1,234.5` in English); Up and Down step by `step` within `min` and `max`. |
| `date` | datetime, text | A date picker. On a date-and-time column it shows and changes the date in the grid's time zone and keeps the time of day; on a text column the value is `yyyy-MM-dd`. |
| `datetime` | datetime (default), text | A date and time picker in the grid's time zone (`timeZone` `utc` or `local`); values are stored as ISO 8601 UTC. On a text column the value is `yyyy-MM-ddTHH:mm`. |
| `time` | datetime, text | A time picker; on a date-and-time column it changes the time of day in the grid's time zone, on a text column the value is `HH:mm`. |
| `select` | any | A list of `options` (values, or `{ value, label }`). A value outside the list stays choosable, so opening the editor never loses it. |
| `toggle` | text | A check box for `true` and `false`. |
| `lookup` | any | A combobox that suggests values as the reader types: the host's `editing.lookups[column]`, else the editor's `options`, else the values of `lookup.column` (the edited column by default): from the rows of an inline grid, or through the data source's `facet` search on a hosted grid. The value must be one of the suggestions (`gridEditChoice` otherwise); Enter on the open list picks, a second Enter applies. `lookup.limit` (1–50, default 20) and `lookup.minLength` (0–16, default 1) tune it. |

### Custom editors

Plugins register editors with the `editors` extension point; a host can pass `editing.editors` for one grid. A column
chooses one by name (`"editor": { "type": "stars" }`, C# `CanopyCellEditor.Custom("stars")`). Host editors win over
plugin editors, which win over the built-in ones with the same name.

```js
CanopyX.use({ name: "stars", editors: { stars: { create(context) {
  const select = document.createElement("select");
  for (let i = 0; i <= 5; i++) select.add(new Option("★".repeat(i) || "none", String(i)));
  select.value = String(context.value ?? 0);
  return { element: select, getValue: () => Number(select.value) };
} } } });
```

`create(context)` returns `{ element, control?, getValue(), focus?(), error?(), destroy?() }`. `getValue` returns the raw
cell value (a string, a finite number, a boolean or null). `error` returns a message while the input is not a value yet
(the built-in number editor refuses text this way). `control` is the focusable element when `element` wraps it; it gets the
accessible name, `aria-invalid` and `aria-describedby`. An editor consumes keys it needs by calling `preventDefault`; the
grid handles Enter, Tab and Escape otherwise. The context carries `value`, `text`, a frozen `row`, `column` (`id`, `title`,
`kind`), the column's `editor` and `rules`, `options`, `labels`, `locale`, `timeZone`, `mode` (`cell`, `row` or `form`),
`initial` (the character the reader typed to start), `signal` (aborts when the editor closes), `commit()`, `cancel()`,
`lookup(search, signal)` and `remember(option)`.

## Validation

A cell is checked when its value changes, in this order: its type, then the column's `validation`, then the host's
`editing.validators[column](value, row)`. A row is checked before it commits: every changed cell, then
`editing.validateRow(row, change)`.

| Rule | Applies to | Message label |
| --- | --- | --- |
| `required` | every kind | `gridEditRequired` |
| type | number, datetime | `gridEditNumber`, `gridEditDate` |
| `min`, `max` | number (numbers), datetime (ISO moments) | `gridEditMin`, `gridEditMax` |
| `step` (number editors) | number | `gridEditStep` |
| `minLength`, `maxLength` | text | `gridEditMinLength`, `gridEditMaxLength` |
| `pattern` | text | `gridEditPattern` |

`validation.message` replaces the label for every failed rule of that column. Validators return a message, `null`, or a
promise of one; `validateRow` returns a row message, messages by column, `null`, or a promise of them. Patterns match the
whole text and use the syntax JavaScript and .NET share (the C# writer checks them with `RegexOptions.ECMAScript`).

A value that fails a check that answers at once keeps its editor open with the message beside the cell; Escape restores the
old value. An asynchronous validator answers after the value is applied and marks the cell. A row with a failed check does
not commit.

Invalid cells carry `aria-invalid="true"` and point `aria-describedby` at their message. The message also shows beside the
cell while the cell or its editor has focus. The drawer's form shows messages under each field, with a summary.

## The change set

An edited cell shows its value the way every cell of its column does: with the column's default formatting (numbers and
dates in the page language and the grid's time zone), or a choice's label for select and lookup columns. When the host
writes the column's text itself (cells with `text`, for example money as `€1,234.50`), it gives the same formatter for
edited values with `editing.formatters`, so edited and untouched cells read alike until the writer's canonical cells
replace them:

```js
const money = new Intl.NumberFormat("en", { style: "currency", currency: "EUR" });
CanopyX.configure("assets", { editing: { formatters: { cost: value => money.format(value) } } });
```

Applied values show at once and stay in the grid's change set until a commit confirms them. Changed cells carry a corner mark
and a hidden "Edited" description (`gridEditEdited`); rows that arrive again (scrolling, sorting, paging) show their pending
values. The edit bar (toggle with `editBar`) shows the number of unsaved changes and errors with Undo, Redo, Discard and Save.

| Member | Result |
| --- | --- |
| `getChanges()` | `[{ id, values, original, errors?, error?, status? }]`: the new values and the values each row started from. |
| `hasChanges()` | Whether any row has unsaved changes. |
| `revertChanges(ids?)` | Puts the rows (all by default) back to their starting values, as one step undo brings back. |
| `setCellValue(id, column, value)` | A host's own change, with the same events, history and checks; read-only rules do not apply. Resolves with `{ applied, valid, error? }`. |
| `validate(ids?)` | Checks the changed rows; resolves with `{ valid, rows: [{ id, valid, errors, error }] }`. |

### Events

| Event | Callback | Detail |
| --- | --- | --- |
| `canopyx:cellValueChanging` (cancelable) | `onCellValueChanging` (return `false` to refuse) | `{ id, column, value, previous, row, source }` with `source` `edit`, `form`, `api`, `undo`, `redo`, `revert`, or `paste` and `fill` for cell ranges ([cell-ranges.md](cell-ranges.md)) |
| `canopyx:cellValueChanged` | `onCellValueChanged` | the same, with `row` as it is after the change (`cellValueChanging` gets it as it was) |
| `canopyx:rowCommit` (cancelable) | `onRowCommit` | `{ id, values, original, row, revision, respondWith(result) }` |
| `canopyx:commit` | `onCommit` | the result of `commitChanges` |

Plugins subscribe with `events: { cellValueChanged(event, context) { … } }`.

## Committing

**Row commit.** When the reader leaves a row they changed (or presses Enter in full-row mode, saves the drawer form, or the
host calls `commitRow(id)`), the row's checks run and, when they pass, `rowCommit` is raised. Its handler decides:

- return (or pass to `event.detail.respondWith`) a row result `{ status: "saved" | "error" | "conflict", cells?, error?, errors? }`,
  `true` for saved, or a promise of either: the row is saved with that answer;
- return `false` or call `preventDefault()`: the commit is cancelled and the row stays changed;
- return nothing: the row stays in the batch for `commitChanges`.

`commitRow` resolves with `{ id, ok, status, error?, errors? }`, where `status` is `saved`, `pending`, `unchanged`,
`invalid`, `cancelled`, `error`, `conflict` or `superseded`.

**Batch commit.** `commitChanges({ ids?, signal? })` checks every changed row (or the ids) and sends the valid ones in one
`gridCommit` document to the writer: `editing.commit(batch, { signal })`, else the data source's `commit(batch, { signal })`,
else an inline grid accepts them in the page; a hosted grid without a writer saves nothing and fails the rows with
`gridEditNotSaved`. It resolves with `{ ok, saved, failed, rows, revision? }`: one result per row, invalid rows included, and
the revision the writer answered with.

The writer answers with a `gridCommitResult`. Saved rows become the rows' new starting values, and the writer's canonical
`cells` replace the shown ones. Rows in `error` or `conflict` keep their changes and show the writer's message (or
`gridEditConflict`, `gridEditRejected`). A row the answer leaves out was not saved. The grid keeps reading pages at the revision it
accepted, so loaded rows keep their places; when the source no longer serves that revision, call `reload()` (in `onCommit`,
for example) to read the writer's new one. An inline grid keeps accepted values in its
rows, so later queries sort and filter by them. Values the reader changed while a row was saving stay as changes.

The documents and the remote endpoint are specified in [Editing and commit](data-protocol.md#editing-and-commit).

```js
CanopyX.configure("assets", {
  source: { query: …, facet: …, commit: (batch, { signal }) => post("/commit", batch, signal) },
  editing: { validators: { name: value => value.length > 60 ? "Too long." : null } },
  onRowCommit: ({ values }) => fetch("/api/assets/row", { method: "POST", body: JSON.stringify(values) })
    .then(response => response.ok ? { status: "saved" } : { status: "error", error: "Not saved." })
});
```

## Undo and redo

Every applied change is a step: one value, a full-row edit, a drawer save or a revert. Ctrl+Z undoes and Ctrl+Y or
Ctrl+Shift+Z redoes while focus is in the grid and not in a text field (a text field keeps its own undo). `undo()`, `redo()`,
`canUndo()` and `canRedo()` do the same from code; `editing.undoLimit` keeps 100 steps by default. Undo after a save changes
the value back as a new unsaved change.

## Keyboard

| Key | On a focused editable cell | In an editor |
| --- | --- | --- |
| F2, Enter | Edit the cell | Enter applies and moves down (Shift+Enter up) |
| A character | Edit the cell, starting with that character | |
| Backspace, Delete | Edit the cell, starting empty | |
| Tab, Shift+Tab | | Apply and edit the next (previous) editable cell, on to the next row; in full-row mode move between the row's editors |
| Escape | | Close without applying |
| Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z | Undo, redo | The text field's own undo |

A double click edits a cell, as does a click on the cell that already has focus; a plain click focuses the cell. A lookup's
open list takes Up, Down, Enter and Escape first. Focus that leaves the grid applies the open editor and leaves an invalid
cell marked.

**Full-row mode** (`mode: "row"`) opens an editor in every editable visible cell of the row. Tab moves between them; Enter
applies the row as one undo step and commits it; Escape leaves the row unchanged.

## Phones

On phones (`drawer: "phone"`, the default) tapping a row opens the record drawer as an edit form: an editor for each editable
field with the same checks, a message under each invalid field, a summary, and Save and Cancel. Save applies the form as one
undo step and commits the row. `drawer: "always"` uses the form on every width; `never` keeps the drawer read-only. Moving to
another record in the drawer leaves unsaved form input behind.

## Read-only rules

- **Per column:** only `editable` columns edit.
- **Per row:** `editing.isEditable(row, column)` returns `false` for cells that must not change (it runs synchronously).
- **Whole grid:** `readOnly` in the view or options, and `setReadOnly(true | false)` at run time.

Cells that cannot be edited carry `aria-readonly="true"`.

## Labels

The editing texts are the `gridEdit…` labels, translated in every label pack (`CanopyLabels.GridEditSave`, …). The editing
part brings their English texts; the core accepts those names before the part loads, so view and host labels can set them.

## API summary

`beginEdit(id, column?, { initial? })`, `endEdit()`, `cancelEdit()`, `isEditing()`, `setCellValue(id, column, value)`,
`getChanges()`, `hasChanges()`, `revertChanges(ids?)`, `validate(ids?)`, `commitRow(id)`, `commitChanges({ ids?, signal? })`,
`undo()`, `redo()`, `canUndo()`, `canRedo()`, `setReadOnly(readOnly)`. They are members of every flat grid's API; before
the part has loaded the reads answer empty and the actions load it first. TypeScript types: `GridEditingApi`,
`GridEditingOptions`, `GridEditorDefinition`, `GridValidation`, `CanopyCellEditor`, `GridChange`, `GridCommit`,
`GridCommitResult` and `GridCommitOutcome` from `@evotecit/canopyx/grid`.

The `editing.html` example is an asset register with every editor type, checks from the definition and the page, read-only
retired assets, undo and a batch save to a mock service that answers per row (and reports a conflict for a row it changed
behind the reader's back).
