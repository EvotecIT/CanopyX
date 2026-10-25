# Flows

A flow is a guided form: steps with typed fields, conditions, validation, a review page with change links, and one
proposal to the host when the reader submits. It is the CanopyX view for setup, connection, schedule and edit tasks.
CanopyX never writes: the flow collects the answers and raises `canopyx:flowSubmit`, and the host applies the change and
answers with what happened.

A flow is a document, like a grid view. C# writes it with `CanopyFlow`; the browser reads it with `CanopyX.createFlow`.
The document shape on this page is the flow contract. CanopyX owns it, and any host can map its own model onto it
(`docs/schema/canopyx-flow-1.schema.json` describes it as a JSON Schema).

The flow ships as the lazily loaded `flow` part with a slim entry point of its own (`canopyx-flow-entry.js`,
`@evotecit/canopyx/flow`). A page with only forms loads no grid code. Grid pages know the part too: `CanopyX.createFlow`
loads it on first use. Flows share their editors and validation with grid editing, the record drawer's edit form and the
calendar's event form through the `forms` part.

- [Quick start](#quick-start)
- [The flow document](#the-flow-document)
- [Steps and sections](#steps-and-sections)
- [Fields](#fields)
- [Conditions](#conditions)
- [Validation](#validation)
- [Layouts](#layouts)
- [The review page](#the-review-page)
- [The proposal and the host's answer](#the-proposal-and-the-hosts-answer)
- [Secrets](#secrets)
- [Host-connected flows](#host-connected-flows): [server checks](#server-checks), [host options and dependent fields](#host-options-and-dependent-fields),
  [records fields](#records-fields), [pick steps](#pick-steps), [task lists](#task-lists), [dialogs and drawers](#dialogs-and-drawers),
  [the equivalent command](#the-equivalent-command), [presets](#presets), [drafts](#drafts), [deep links](#deep-links),
  [the preview and consent on the review page](#the-preview-and-consent-on-the-review-page)
- [An endpoint: MapCanopyFlow](#an-endpoint-mapcanopyflow) and [reading a proposal on the server](#reading-a-proposal-on-the-server)
- [JavaScript API](#javascript-api)
- [Labels and right to left](#labels-and-right-to-left)
- [Accessibility](#accessibility)
- [Packaging and size](#packaging-and-size)

## Quick start

```csharp
var flow = new CanopyFlow("mail-server", "Connect a mail server") { Submit = new CanopyFlowSubmit("Save settings") };

flow.Step("server", "Which server sends the mail?", step => step
    .Text("host", "Server name", f => f.Required().Help("A host name or an IP address, such as mail.example.com").Path("mail.host"))
    .Number("port", "Port", f => f.Default(587).Range(1, 65535).Half().Path("mail.port"))
    .Choice("security", "Connection security", f => f
        .Option("starttls", "STARTTLS", "Upgrades a plain connection. Port 587 is usual.")
        .Option("tls", "TLS from the start", "Port 465 is usual.")
        .Option("none", "None", "Only inside a trusted network.")
        .Default("starttls").Path("mail.security")));

flow.Step("sign-in", "How does it sign in?", step => step
    .Text("user", "User name", f => f.Path("mail.user"))
    .Secret("password", "Password", f => f.Path("mail.password"))
    .Toggle("verify", "Check the server certificate", f => f.Default(true)
        .When(CanopyFlowCondition.NotEqual("security", "none")).Path("mail.verifyCertificate")));

flow.Review(review => review.Declaration("The settings apply to new messages."));

File.WriteAllText("mail-server.html", flow.ToHtmlPage(new CanopyHtmlOptions { Title = "Connect a mail server" }));
```

The host answers the proposal in the page:

```js
document.addEventListener("canopyx:flowSubmit", event => {
  const { values, secrets } = event.detail;          // never the password itself
  const password = event.detail.secret("password");  // once, inside the handler
  event.detail.respondWith(fetch("/api/mail", { method: "POST", body: JSON.stringify({ values, password }) })
    .then(response => response.ok ? { status: "saved", message: "Mail settings saved." } : { status: "error", message: "Not saved." }));
});
```

A JavaScript host builds the same flow from the document itself:

```js
import { createFlow } from "@evotecit/canopyx/flow";
const flow = createFlow(document.getElementById("setup"), { flow: documentFromServer, onSubmit: detail => save(detail) });
```

## The flow document

```json
{
  "kind": "flow", "version": 1, "id": "mail-server", "title": "Connect a mail server",
  "mode": "linear", "layout": { "orientation": "auto" },
  "steps": [
    { "id": "server", "title": "Which server sends the mail?", "fields": [
      { "id": "host", "type": "text", "label": "Server name", "required": true, "path": "mail.host" },
      { "id": "port", "type": "number", "label": "Port", "default": 587, "width": "half", "validation": { "min": 1, "max": 65535 } } ] },
    { "id": "review", "type": "review", "title": "Check your answers" }
  ],
  "submit": { "label": "Save settings" }
}
```

| Field | Meaning |
| --- | --- |
| `kind`, `version` | `"flow"` and `1`. A reader rejects any other pair. |
| `id` | The flow's identifier: a letter, then up to 63 letters, digits, `-` and `_`. |
| `title`, `description` | The flow's heading and an optional line under it. Plain text. |
| `mode` | `linear` (default): a step opens when the steps before it are valid. `free`: any visible step opens at any time and the review page checks everything. `tasks`: a [task list](#task-lists). |
| `layout` | `{ "orientation": "auto" \| "horizontal" \| "vertical", "container": "inline" \| "dialog" \| "drawer", "launch" }`. `auto` (default) uses the horizontal stepper for up to six visible steps whose titles fit the width, and the vertical one otherwise. Narrow hosts (below 640 px) stack the steps; a flow with one visible step shows no rail. `container` opens the flow [in a dialog or drawer](#dialogs-and-drawers) from a button labelled `launch` (default the title). |
| `density` | `compact`, `normal` (default) or `comfortable`, as the grid densities. |
| `timeZone` | `utc` (default) or `local`: the zone date-and-time fields show and enter. |
| `steps` | 1 to 64 steps. A `review` step, when present, is the last. |
| `initial` | Edit mode: the values the flow edits, by field id (see [Edit mode](#edit-mode)). |
| `storedSecrets` | Edit mode: ids of secret fields that already have a stored value. Never the values. |
| `baseline` | Edit mode: the host's revision of the edited settings, echoed in the proposal. |
| `submit` | `{ "label" }`: the submit button's text. Default "Submit". |
| `labels` | Translations of the texts the flow writes itself (`flow…` and the shared `gridEdit…` messages). |
| `command` | `{ "name", "style", "variants" }`: [the equivalent command](#the-equivalent-command) the review page shows. |
| `presets` | Up to 32 [presets](#presets): `{ "id", "label", "description", "values" }`. |
| `draft` | `none` (default), `session`, `local` or `host`: where the [draft](#drafts) lives. |
| `deepLinks` | `true`: the page's address names the open step ([deep links](#deep-links)). |
| `endpoint` | `{ "url", "routes" }`: routes that answer the hooks ([an endpoint](#an-endpoint-mapcanopyflow)). |

Every text in the document is plain text; nothing is read as HTML.

## Steps and sections

```json
{ "id": "tls", "title": "Certificate checks", "description": "Shown only with a secure connection.",
  "when": { "operator": "and", "filters": [{ "field": "security", "operator": "ne", "values": ["none"] }] },
  "sections": [{ "id": "client", "label": "Client certificate", "fields": [ … ] }] }
```

| Step field | Meaning |
| --- | --- |
| `id`, `title` | Required. Titles are questions or nouns ("Which server sends the mail?"), never "Step 3". |
| `description` | A line under the title. |
| `type` | `form` (default), `info` (text only), `pick` (a [pick step](#pick-steps)) or `review` (the [review page](#the-review-page)). |
| `fields`, `sections` | The step's fields, then its sections. A section has `id`, `label`, optional `description`, `fields` and `when`, and uses the record panel's label/value layout. A section with `"source": "host"` takes its fields from the host ([host sections](#host-sections)). |
| `checks` | Form steps: up to 8 [server checks](#server-checks). |
| `group` | Task lists: the heading the task sits under. |
| `pick` | Pick steps: the picker. |
| `when` | A [condition](#conditions): the step shows only while it holds. |
| `optional` | The rail marks the step optional. Its fields still follow their own `required`. |
| `declaration`, `changesOnly` | Review steps only: text above the submit button, and whether edit mode shows only changed answers first (default true). |
| `confirm`, `acknowledge` | Review steps only: [typed confirmation and an acknowledgement](#the-preview-and-consent-on-the-review-page). |
| `preview` | Review steps only: `true` says the page shows the [host's preview](#the-preview-and-consent-on-the-review-page) (C# `review.Preview()`). |

Branching is ordered steps with conditions, not jumps. A hidden step or field keeps its answer while the reader goes back
and forth, and is left out of the proposal. The rail shows only visible steps, so "Step 3 of 5" stays true.

## Fields

Every field has `id` (unique in the flow), `type` and `label`, and optionally:

| Field | Meaning |
| --- | --- |
| `help` | A line under the label, before the input. |
| `placeholder` | The empty input's hint (text, number, lookup, text area, list), drawn fainter and in italics. Keep it a short hint about the expected format, such as "For example: name@example.com"; a sample answer belongs in `help`. |
| `required` | An empty answer is an error. Optional fields say "(optional)" in their label; nothing gets an asterisk. |
| `default` | The starting value in create mode. |
| `readOnly` | Shown, not changed. |
| `when` | A [condition](#conditions) for the field. |
| `width` | `full` (default) or `half`: two half fields share a row on wide forms. |
| `parameter` | The parameter name in [the equivalent command](#the-equivalent-command). |
| `path` | The setting the field writes, as dot-separated names (`mail.smtp.host`): the JSON patch of the proposal uses it. |
| `sensitive` | A non-secret value the host keeps out of drafts and exports. It still shows on the review page. |
| `validation` | The checks below. |
| `source`, `dependsOn` | `"source": "host"` loads the options of a select, choice, multiple-choice or lookup field from the host; `dependsOn` names up to 16 fields whose change reloads them, or empties a field without host options ([host options](#host-options-and-dependent-fields)). |

| `type` | Value | Notes |
| --- | --- | --- |
| `text` | string | Grid editor. `validation`: `minLength`, `maxLength`, `pattern`, `message`. |
| `number` | number | Grid editor: reads numbers as the page language writes them. `step`; `validation`: `min`, `max`. |
| `date` | `yyyy-MM-dd` | Grid editor. |
| `datetime` | ISO 8601 UTC | Grid editor, in the flow's time zone. `validation`: `min`, `max` as ISO moments. |
| `time` | `HH:mm` | Grid editor. |
| `select` | option value | Grid editor: a drop-down for short lists. |
| `toggle` | boolean | Grid editor, drawn as a switch. `onText`, `offText` name the two states on the review page. |
| `lookup` | option value | Grid combobox: suggestions from `options` (at least one) as the reader types. |
| `choice` | option value | A radio group, or choice cards with a title, description, badge and disabled reason. `display`: `cards` or `list`; cards by default up to five options. |
| `multiChoice` | array of option values | Check boxes with "Select all", "Clear" and a "3 of 12 selected" count. `validation`: `minItems`, `maxItems`. Options may name a `group`. |
| `textarea` | string | `rows` (2 to 20, default 4). Same text checks as `text`. |
| `list` | array of strings | One value per row with Add and Remove; pasted lines become rows. `validation`: `minItems`, `maxItems` (at most 1,000), `item` (`email`, `host`, `ip`, `cidr`, `url`), `itemPattern`. |
| `secret` | never in values | A masked input with a reveal button (`reveal: false` leaves it out). `keepWhenBlank` (default true when `storedSecrets` lists it); `validation`: `minLength`, `maxLength`, `pattern`. See [Secrets](#secrets). |
| `duration` | ISO 8601 duration (`PT15M`) | A number and a unit. `units`: some of `seconds`, `minutes`, `hours`, `days` (default minutes, hours, days); `validation`: `min`, `max` as durations. |
| `records` | array of rows | A small table of typed rows with Add and Remove ([records fields](#records-fields)). `columns`; `validation`: `minItems`, `maxItems`. |
| `custom` | the editor's | `editor` names an editor a plugin or the host registers (`editors`, as in [grid editing](editing.md#custom-editors)). |

Options are `{ "value", "label", "description", "badge", "disabledReason", "group" }`, where `value` is a string, number or
boolean and only `value` is required; a field takes at most 1,000. Labels, titles and option labels hold up to 200 characters and
help, descriptions and declarations up to 1,000; the layout keeps a few texts shorter: a badge up to 40 characters, a
disabled reason up to 400, `onText` and `offText` up to 60 and the submit label up to 80.

### Edit mode

A flow that edits existing settings carries their current values in `initial` (and `storedSecrets`, `baseline`). The
fields start from those values, the review page shows what changed as "was / now" and, by default, only the changes, and
the proposal carries the changes and a JSON patch. In create mode fields start from their `default`.

An empty `initial: {}` also selects edit mode, for example when only stored secrets are being edited. In C#, set
`IsEditMode = true` to write that empty baseline; adding values to `Initial` also selects edit mode. Optional collection
answers can be `null` or an empty array, both of which count as empty during validation.

Stored secrets or a baseline revision also select edit mode. Missing edit-mode fields start empty; create-mode defaults
do not become changes to existing settings. A host can supply explicit starting answers through `values`.

## Conditions

Conditions are data, never script. They use the filter builder's grammar (the same groups and operators as grid filter
groups and [formatting conditions](conditional-formatting.md#conditions)), with `field` naming a field where a grid names a
`column`:

```json
{ "operator": "and" | "or" | "none", "filters": [{ "field": "port", "operator": "gt", "values": [1024] }], "groups": [ … ] }
```

| Operators | Values |
| --- | --- |
| `eq`, `ne`, `gt`, `ge`, `lt`, `le` | one |
| `contains`, `notContains`, `startsWith`, `endsWith` | one |
| `matches`, `notMatches` | one bounded pattern, as in [formatting](conditional-formatting.md#conditions) |
| `in`, `notIn` | 1 to 1,000 |
| `between` (inclusive) | two, lower first |
| `isNull`, `isNotNull` | none |

Text compares without case, with the search folding, and orders by UTF-16 code units after folding; numbers compare as
numbers and booleans only with `eq` and `ne`. Values never convert: a number compared with text is not equal to it (`ne`
and `notIn` are true, the other operators false). A field that is hidden reads as empty, so a condition never depends on an
answer the proposal leaves out. An empty answer (missing, `null`, empty text or no items) matches only `isNull`, as in grid
filters: every other operator, `ne`, `notIn`, `notContains` and `notMatches` included, is false for it. For array values
(`multiChoice`, `list`) `contains` and `notContains` test one item, `in` and `notIn` test whether any item is listed, and
the comparison operators (`eq` to `le`, `between`, `startsWith`, `endsWith`, `matches`) are false. Patterns test the first
4,096 UTF-16 code units without case. A condition never reads a secret field. A condition holds at most eight levels, 64 groups
and 64 predicates. C# evaluates the same conditions (`CanopyFlowCondition.Evaluate`), and the shared fixtures in
`tests/fixtures/flow-conditions.json` prove that both agree.

## Validation

| Level | What runs | When |
| --- | --- | --- |
| Field | Type, `required`, the field's `validation`, then the host's `validators[field](value, values)` | When the reader leaves a field, and as the reader types or chooses once the field shows a problem |
| Step | Every visible field of the step, then the host's `validateStep(stepId, values)` | On Next, and when Review opens the step |
| Flow | Every visible step, then the host's `validateFlow(values)` | On the review page and on submit |

Validators answer a message, `null`, or a promise of one. `validateStep` and `validateFlow` answer `null`, a message, or
`{ errors: [], warnings: [], fieldErrors: { field: message } }`. Errors block Next and submit; warnings show on the review
page. Messages sit under their field (`aria-describedby`), and a summary at the top of the step links to each one. Field
messages use the grid's editing labels (`gridEditRequired`, `gridEditMin`, …) with the field's label as `{column}`.

## Layouts

- **Horizontal stepper:** numbered markers with titles in a rail above the form. Only the current step uses the accent;
  complete steps carry a quiet check; steps with errors carry a count.
- **Vertical stepper:** the rail on the inline start side with titles and state text, for long flows.
- **Narrow hosts** (below 640 px): the steps stack as an accordion and the current step opens under its title.
- **One step**: no rail; the step's heading says what it asks. An automatic horizontal rail whose titles do not fit turns vertical.

The form column caps at a readable width; half fields pair up on wide forms. The action bar keeps Back on the start side
and Next or the submit button on the end side, mirrored in right-to-left pages. Nothing animates.

## The review page

- One summary list per visible step, with the label, the displayed answer and a **Change** button whose accessible name
  says what it changes ("Change Server name"). Change opens the step; Next on it returns to the review page.
- Skipped optional answers read "Not provided". Secrets read "Set", "Unchanged" or "Not set".
- A banner says "Ready to submit" or how many errors and warnings there are, with links to the steps.
- In edit mode, changed answers show what they were. "Show changes only" (on by default) hides the rest.
- The declaration sits above the submit button.

## The proposal and the host's answer

On submit the flow validates everything and raises **`canopyx:flowSubmit`** (cancelable) with a `flowSubmission`:

```json
{ "kind": "flowSubmission", "flow": "mail-server", "version": 1, "mode": "edit", "baseline": "rev-12",
  "values":  { "host": "smtp.example.com", "port": 587, "security": "starttls", "verify": true },
  "secrets": { "password": { "state": "keep" } },
  "changes": [{ "field": "host", "path": "mail.host", "from": "old.example.com", "to": "smtp.example.com" }],
  "patch":   [{ "op": "replace", "path": "/mail/host", "value": "smtp.example.com" }] }
```

- `values` holds the visible answers only; hidden steps and fields are left out. Secrets are never in it.
- `secrets` holds each visible secret field's state: `set` (a new value was typed) or `keep` (left blank, a stored value
  stays). An optional secret left blank without a stored value is left out.
- `changes` (edit mode) lists each visible field whose answer differs from `initial`.
- `patch` is a JSON Patch built from field `path`s: `add`, `replace` and `remove` using the field baseline in edit mode, `add` for
  every answered field in create mode. Secret fields never appear in it.

The host applies `patch` to its configuration object. Every parent object in a path must already exist, as JSON Patch
requires: an `add` at `/mail/host` works against `{ "mail": {} }`, but not against `{}`. In create mode, and when enabling
a new settings section in edit mode, the host prepares the required containers before applying the proposal. CanopyX
does not add parent objects: replacing one could discard settings that the flow does not describe. The host also checks
the baseline and authorizes the write before applying any operation.

The detail also has `respondWith(answer)` and `secret(id)`. The host answers with an object, or a promise of one, through
`respondWith`, the `onSubmit` callback's return value, or `hooks.submit`:

```json
{ "status": "saved" | "accepted" | "error" | "conflict", "message": "…",
  "fieldErrors": { "host": "Not reachable from the service." }, "stepErrors": { "server": "…" },
  "result": [{ "label": "Key", "value": "…", "once": true }], "links": [{ "label": "Open the dashboard", "href": "/admin" }] }
```

| Status | What the flow shows |
| --- | --- |
| `saved` | The result panel: the message, `result` rows and `links`, and "Start another". Rows marked `once` get Copy and "I have saved it"; Start another stays disabled until each is acknowledged, and they leave the page with the panel. |
| `accepted` | The host started longer work: a progress panel with the message. The host updates it with `setProgress({ done, total, message })` and finishes with `complete(answer)`. |
| `error` | Back to the review page with the message and the field and step errors in place. |
| `conflict` | Back to the review page with the conflict message and "Reload current settings", which raises `canopyx:flowReload` with `{ baseline }`. |

Without any answer the flow returns to the review page and says that no host received the answers. Links use `http`,
`https`, `mailto` or relative addresses; others are dropped.

## Secrets

Secret values appear in exactly two places: the input itself, and `event.detail.secret(id)` inside the submit handler,
which returns each value once and nothing after the answer settles. They are never part of `values`, `getValues()`,
`getState()`, the review page, the patch, any other event, an error message or the DOM outside the input. The input uses
`type="password"` and `autocomplete="new-password"`; the reveal button switches it to text until the step changes.

With `keepWhenBlank` (the default for a field listed in `storedSecrets`) the input starts empty with the hint "A value is
saved. Leave blank to keep it.", and a blank answer is `keep`. A required secret without a stored value must be typed.

## Host-connected flows

The flows above run on the document alone. A flow can also ask its host while the reader works: run a check, load options
or fields, list task states, preview what submitting does, keep a draft. Each is a hook of `createFlow`'s `hooks` (or
`CanopyX.configure`), or a route of an [endpoint](#an-endpoint-mapcanopyflow) that answers them without script. Every
asynchronous hook receives an `AbortSignal` that a newer request, Cancel, `destroy()` or the timeout aborts; the timeout is
the `timeout` option (30 seconds by default, 100 ms to 10 minutes). A late answer to an aborted request is dropped, and a
hook that throws, rejects or times out fails in place with its message and an `error` event.

### Server checks

```csharp
flow.Step("sign-in", "How does it sign in?", step => step
    .Text("user", "User name", f => f.Required().Path("mail.user"))
    .Secret("password", "Password", f => f.Required())
    .Check("sign-in-test", "Test sign-in", check => check.Fields("host", "user", "password").RequirePass()));
```

```json
"checks": [{ "id": "sign-in-test", "label": "Test sign-in", "fields": ["host", "user", "password"], "required": "pass" }]
```

A check is a named host action on a form step, such as "Send a test message" or "Test sign-in". Its button runs
`hooks.check(checkId, values, { signal, secret })`, which answers `{ status: "pass" | "warning" | "fail", message, details:
[{ label, value }], fieldErrors }`. The step shows running (with Cancel), passed, warning or failed with the time, the message
and the details; field messages show beside their fields. Changing any field the check names, or an answer that controls
its visibility, marks its result stale and cancels a running check. This includes conditions on its section or step.

| `required` | Next on the step |
| --- | --- |
| (none) | Never waits for the check. |
| `run` | Runs the check when it has no current result, then needs it not to have failed; a warning needs "Continue despite the warning" ticked. |
| `pass` | Runs the check when it has no current result, then needs a pass. |

`secret(id)` reads, once per run, a secret the check names; it is the only way a secret reaches a check, and only secret
fields the check lists. The review page lists each check with its last result and Run again, which runs the check right
there on the answers the page shows (a check is no answer, so it has no Change link); the page then checks itself again.
The proposal's `checks` carries
`{ status, at }` for the results that are still current. Those are what the browser saw: a host that relies on a check runs
it again on the submitted answers. `api.runCheck(id)` runs one from script; `canopyx:flowCheck` reports each result.

A host whose tested settings also change outside the flow calls `api.invalidateChecks(["sign-in-test"])`, or
`api.invalidateChecks()` for every check. Completed results and details stay visible as stale evidence. Matching running
checks are cancelled, their secrets are revoked, and late answers cannot replace a newer result. Pending validation or
submission that relied on the invalidated evidence is retired too, including its submission secret reader. Field values and the
form's dirty state stay unchanged. Required checks need a current result at the next validation or submission. An empty
array does nothing; unknown ids are rejected before any check changes. Await `api.ready` first, as for other synchronous
members. Flows with no checks do not load the checks part and reject this operation.

### Host options and dependent fields

```csharp
.Select("region", "Data centre", f => f.Option("eu", "Europe").Option("us", "United States"))
.Select("relay", "Relay", f => f.FromHost().DependsOn("region"))
```

A field with `"source": "host"` asks `hooks.options(fieldId, values, { signal })` for its options as the reader reaches it,
and again when a field in `dependsOn` changes. The field says "Loading options…" meanwhile; a failure says why, with Try
again. An answer the new options still allow (and do not disable) is kept; any other is cleared. A field with `dependsOn`
but document options starts empty again when what it depends on changes. `api.refreshOptions(id)` loads again from script.
Conditions and dependencies never read secrets, and dependencies never run in a circle.

#### Host sections

```csharp
.Section("engine-options", "Engine options", section => section.FromHost("engine"))
```

A section with `"source": "host"` has no fields of its own: `hooks.fields(sectionId, values, { signal })` answers up to 64
field definitions as the step opens, and again when a field in `dependsOn` changes. They are read as strictly as the
document's, of the plain types (text, number, date, date-and-time, time, select, toggle, lookup, choice, multiple choice,
text area, list, duration), without `path`, `parameter`, `source` or `dependsOn`; their conditions may read the flow's own fields. Their
answers join the proposal like any other, and the server checks them against the same definitions
([reading a proposal](#reading-a-proposal-on-the-server)).

### Records fields

```csharp
.Records("rules", "Routing rules", f => f
    .Column("severity", "Severity", CanopyFlowRecordColumnKind.Select, c => c.Option("error", "Errors").Option("info", "Information").Required())
    .Column("address", "Send to", CanopyFlowRecordColumnKind.Text, c => c.Required())
    .Column("quiet", "Quiet hours", CanopyFlowRecordColumnKind.Toggle)
    .Count(null, 10).Path("mail.rules"))
```

A records field is a small table: up to 16 typed columns (`text`, `number`, `date`, `time`, `select`, `toggle`) and up to
1,000 rows, each `{ column: value }`, with Add row and a Remove button per row. Each cell uses the shared editor of its
type, labelled "Severity, row 2". Columns take `required`, `options` (select), `width` and `validation` (`min`, `max`,
`minLength`, `maxLength`, `pattern`, `message`); the field takes `minItems` and `maxItems`. A failing cell's message names its
row ("Row 2: Send to is required."), and the review page says "3 rows". Records answers have no command-line form.

### Pick steps

```csharp
flow.Pick("servers", "Which servers?", servers, picker => {
    picker.Label("name");
    picker.Field.Count(1, 20).Required();
});
```

A pick step embeds an ordinary grid or tree view: its search, facets, filters, saved views and record drawer all work.
The selection is the answer of the step's one field: the picked records as `[{ id, label }]`, where `label` is the text of
the `label` column when the record was picked, so the review page and the proposal can list them without the view. A tray
beside the view lists what is chosen, with Remove buttons and Clear; it survives searches and paging (`tray: false` leaves
it out). `minItems` and `maxItems` count the picks; `maxItems: 1` picks one record. Conditions read the picked ids.
Picked record ids are at most 256 characters; the display label snapshot is limited to 400 characters.
"Select all matching" names a query rather than records, so a pick step returns to the records it can list. A host gives
the view options of its own (a remote source, for example) with `hooks.pickers[stepId]`.

A pick step needs grids and trees: C# writes a flow with one for the reporting entry point, whose grids pick with row
check boxes; on a grid page `CanopyX.createFlow` uses the page's entry point. The flow entry point carries no grid code and
refuses a pick step.

### Task lists

```csharp
var flow = new CanopyFlow("service-setup", "Set up the reporting service") { Mode = CanopyFlowMode.Tasks };
flow.Step("database", "Connect the database", step => step.Group("Connect") /* fields */);
```

`"mode": "tasks"` opens the flow on a hub: its visible steps as task rows under their `group` headings, each a button with
its state in words ("Not started", "Complete", "Needs action", "Cannot start yet", "Optional"), the host's one-line summary
and its blockers, under "2 of 4 tasks complete". A task opens as a step; Save and return validates it and comes back, with
focus on the task's row. The host sets states through `hooks.status(values, { signal })`, which answers
`{ stepId: { state, summary, blockers } }` as the hub opens and after answers change, or `api.setStepState(id, state)`.
A blocked task does not open. Review and submit opens once every required task (not optional) is complete.

### Dialogs and drawers

`"layout": { "container": "dialog" }` (or `"drawer"`) puts a launch button in the host; it opens the flow as a modal
dialog, centred, or along the inline end for a drawer, full screen on phones. Focus stays inside and returns to the launch
button when it closes. Escape, the close button and Cancel ask "Discard your answers?" in place when answers changed: the
host hears the cancelable `canopyx:flowLeaving` (or `onLeaving` returning false) first. A flow that saved starts afresh the
next time it opens. `api.open()` and `api.close()` drive it from script.

### The equivalent command

```csharp
flow.Command = new CanopyFlowCommand("Set-MailServer").Variant("csharp", "C#");
```

The review page shows the answers as a command line in a collapsible "Equivalent command" panel, with tabs for the
variants the host writes (`hooks.commands[variantId](values)`), the JSON patch, and Copy. The command uses each visible
field's `parameter` and leaves out hidden, empty and unchanged answers (the default in create mode, the edited value in
edit mode). Lists join with commas, values are quoted for the `style` (`powershell`, the default, `posix` or `windows`), a
switch that was on and is now off becomes `-Name:$false` or `--no-name`, and a typed secret is `<secret>`, never its value.
The proposal's `command` carries the line. C# writes the same line with `CanopyFlow.FormatCommand`, and the server computes
it again from the answers; the shared fixture `tests/fixtures/flow-commands.json` keeps the browser and C# in step.
Windows-style quoted values escape backslashes before quotes and at the end of a value, so paths ending in `\` preserve
the arguments that follow them.

### Presets

```csharp
flow.Preset("office", "Office relay", preset => preset.Value("host", "relay.office.example.com").Value("port", 25d));
```

A "Start from" menu above the steps lists the presets (and, with `hooks.presetStore.list(flowId)`, the host's saved ones).
Choosing one sets its answers on top of the plain start; answers the reader changes afterwards carry a quiet "Changed" mark,
and the review page says "Based on Office relay, 2 changes". With `presetStore.save(flowId, preset)`, "Save as preset" keeps
the current answers (never secrets or sensitive fields). The proposal's `preset` names the preset the answers started from.

### Drafts

`"draft": "session"` (or `"local"`, or `"host"` with `hooks.draftStore { load, save, clear }`) keeps a draft: the answers,
never secrets or sensitive fields, the open step, the completed steps, the preset and the baseline. It saves a moment after
each change and on Save draft. A flow that finds a draft offers "Resume where you left off" or "Start again"; when the draft's
baseline is not the flow's, it warns that the settings changed after the draft was saved. Answers that no longer fit their
field are left out. A saved or accepted answer clears the draft. Storage that a browser refuses leaves the flow working
without drafts.

### Deep links

With `"deepLinks": true` the page's address names the open step, `#flow-id/step-id` (`#flow-id` for a task list's hub),
replacing the history entry rather than adding one. Opening the page or following such a link opens that step, a dialog
flow included; in a linear flow a step past one whose answers are missing opens that step instead. `formatLink(stepId)` and
`parseLink(fragment)` give a host a scheme of its own. Answers never go in the address.

### The preview and consent on the review page

`hooks.preview(values, { signal })` answers what submitting will do, as rows `[{ label, value, tone }]` or `{ title, rows,
notes }` (`tone`: `info`, `success`, `warning`, `danger`). The review page shows it under "Preview", loading as it opens.
A document that relies on it says so with `"preview": true` on its review step (C# `review.Preview()`), and an endpoint
with the preview route does the same: the page then loads the preview part with the flow. A preview hook alone loads the
part too, but a page that cannot load it still shows the review page, without the preview.

A destructive flow asks for consent before its submit button works:

```csharp
flow.Review(review => review
    .Confirm("Type {text} to confirm", "RETIRE")
    .Acknowledge("I understand that their history is removed.", CanopyFlowCondition.Equal("history", "remove")));
```

`confirm` asks the reader to type a text exactly (`text`), or the answer of a field (`field`, such as the domain being
removed); `acknowledge` asks for a ticked box, only while its condition holds. Submitting without them says what is missing
and moves focus there. They are the reader's consent in the browser and do not travel in the proposal.

## An endpoint: MapCanopyFlow

`CanopyX.AspNetCore` maps a flow's hooks to routes, so a page needs no script of its own:

```csharp
var handlers = new CanopyFlowHandlers {
    Check = async (context, request) => await mail.TestAsync(request.Values, request.ReadSecret("password")),
    Options = (context, request) => Task.FromResult(relays.For(request.Values.TryGetValue("region", out var region) ? region as string : null)),
    Preview = (context, request) => Task.FromResult(new CanopyFlowPreview().Row("Applies", "At once", CanopyFlowTone.Success)),
    Drafts = new MyDraftStore(),
    Submit = async (context, submission) => submission.IsCurrent
        ? await settings.ApplyAsync(submission.Patch, submission.ReadSecret("password"))
        : CanopyFlowAnswer.Conflict()
};
app.MapCanopyFlow("/api/flows/mail", context => MailFlow(context), handlers, options => options.AuthorizationPolicy = "Mail.Admin");
// The page: flow.UseEndpoint("/api/flows/mail", handlers.Routes)
```

Each handler that is set maps its route below the pattern: `POST options`, `fields`, `check`, `validate`, `preview`, `status`
and `submit`, and `GET`/`PUT`/`DELETE draft`. The document's `endpoint` names the routes, and the browser posts JSON to
`<url>/<route>` on the page's own origin with the page's cookies and the `headers` option (an antiforgery token, for
example) for every hook the host left unset. Secrets travel only to `check` (the ones the check tests) and `submit` (the
ones the proposal sets).

The flow callback builds the flow for each request as the page did (edit-mode values, stored secrets and baseline
included): the server reads every request against it and never trusts the browser's copy. The routes require
authorization (the default policy, or `AuthorizationPolicy`) unless `AllowAnonymous` is set; bodies must be JSON
(`application/json`, 1 MiB by default, `MaxRequestBytes`), so cross-origin pages go through a CORS preflight. Malformed
requests answer 400 with `{ "error", "message" }`, an oversized body 413, another content type 415; server failures answer
a generic 500 and are logged. Apply rate limiting, CORS and antiforgery to the returned route group.

The submit route reads the proposal with `CanopyFlowSubmission.ParseRequestAsync`, using the `Fields` handler for host
sections and the `Options` handler (or the endpoint's `HostOptions` callback) for host options, so an answer the host no
longer offers is refused. Answers that fail the flow's checks answer an error with the messages beside
the fields, without calling the handler; a proposal whose baseline is not the flow's answers a conflict
(`RejectStaleBaseline`, on by default). A `PUT draft` keeps only a well-formed draft of the flow without secrets or
sensitive answers (`CanopyFlowResponses.DraftAsync`). The draft reader uses the same host-section field definitions as the
submission reader, so a host field marked sensitive cannot enter the store. `MapCanopyFlow` loads those definitions through
the `Fields` handler. Standalone readers use `CanopyFlowReadOptions.SectionFields` with `Draft`, or `SectionFieldsAsync`
with `DraftAsync`; a draft containing host answers is refused when their field definitions are unavailable.

## Reading a proposal on the server

`CanopyX.Data` reads proposals without ASP.NET Core:

```csharp
var submission = CanopyFlowSubmission.Parse(flow, proposalJson, secrets, new CanopyFlowReadOptions { SectionFields = EngineFields });
```

| Member | What it holds |
| --- | --- |
| `Values` | The answers of the visible, non-secret fields (host-section fields included), in their canonical form. |
| `Secrets`, `ReadSecret(id)` | Each visible secret's state (`Set`, `Keep`, `Clear`), and a typed value, once. |
| `Changes`, `Patch`, `PatchToJson()` | Edit-mode changes and the JSON patch, computed from `CanopyFlow.Initial` and the answers. |
| `Command` | The equivalent command, computed from the answers. |
| `Checks` | The check results the browser reports: claims, to run again before relying on them. |
| `Baseline`, `IsCurrent` | The baseline the proposal echoes, and whether it is the flow's. |
| `PresetId`, `IsEdit` | The preset the answers started from, and the mode. |

Parse reads the proposal against the flow: answers of hidden, unknown or secret fields, values of the wrong type, secrets
the proposal does not set and anything outside the contract throw `CanopyRequestException` (400). Every visible field is
checked with the browser's rules (required, ranges and steps, lengths and patterns, counts, item rules, records cells,
enabled document options and current host options); failures throw `CanopyFlowSubmissionException`, whose `ToAnswer()` is the error answer the browser
shows beside the fields; they use the flow's labels, with numbers and moments written invariantly (the browser writes them
in the page's language). The browser's own `changes`, `patch` and `command` are never used. `CanopyFlowRequest.Parse` reads
the hooks' requests the same way, and `CanopyFlowAnswer`, `CanopyFlowCheckResult`, `CanopyFlowValidationResult`,
`CanopyFlowPreview`, `CanopyFlowStepStatus` and `CanopyFlowResponses` write their answers.

## JavaScript API

```js
const flow = CanopyX.createFlow(host, {
  flow,                     // the document
  values,                   // starting values on top of defaults or initial
  labels,
  hooks: { validators: { host(value, values) {} }, validateStep(stepId, values) {}, validateFlow(values) {}, submit(detail) {},
           options, fields, check, preview, status, commands: {}, draftStore: {}, presetStore: {}, pickers: {} },
  editors: { stars: { create(context) {} } },
  timeout: 30000,           // asynchronous hooks, in milliseconds
  headers: {},              // an endpoint's requests
  onReady, onStepChange, onValueChange, onSubmit, onSubmitted, onReload, onCheck, onLeaving, formatLink, parseLink
});
```

Fragments written by C# mount automatically and take options through `CanopyX.configure(flowId, options)`;
`data-cx-mount="manual"` waits for `CanopyX.mount`.

Await `api.ready` before calling synchronous members such as `getValues()`, `setValues()` or `reset()`. They throw a clear
not-ready error while the lazy implementation is loading. Asynchronous members (`next`, `back`, `goTo`, `setState`,
`validate` and `submit`) wait for readiness. After destruction, synchronous calls throw and asynchronous calls reject;
destroying a flow also releases its host so `CanopyX.mount(host)` can mount it again.

| Member | Result |
| --- | --- |
| `next()`, `back()`, `goTo(stepId)` | Navigation; `next` validates the current step first. Each resolves with whether the step changed. |
| `getStep()` | The current step id. |
| `getValues()` | The visible answers, never secrets. |
| `setValues(partial)` | Sets answers (not secrets), as a host change. |
| `getState()`, `setState(state)` | The current step and the answers, never secrets. |
| `isDirty()`, `reset()` | Whether an answer changed from its start, and back to the start. |
| `validate(stepId?)` | Resolves with `{ valid, errors, warnings }` for a step or the whole flow. |
| `setFieldError(fieldId, message)` | Shows a host message on a field (null clears it). |
| `submit()` | Validates and raises `flowSubmit`; resolves with the host's answer. |
| `setProgress({ done, total, message })`, `complete(answer)` | Drive an `accepted` answer to its end. |
| `runCheck(checkId)` | Runs a check; resolves with its result, or null when it was cancelled. |
| `invalidateChecks(checkIds?)` | Marks selected checks stale (all when omitted), cancels their runs and ignores late answers after an external dependency changes. |
| `refreshOptions(fieldId)` | Loads a host-option field's options again. |
| `setStepState(stepId, state)` | Sets a task's state as the host sees it; null returns it to what the answers say. |
| `saveDraft()`, `setPreset(presetId)` | Saves the draft now; starts from a preset (null for the plain start). |
| `open()`, `close()` | Opens and closes a dialog or drawer flow; `close` asks first when answers would be lost. |
| `destroy()`, `ready` | Removes the flow; a promise for the first paint. |

If answers change while a submission is waiting for the host, its response does not settle the changed form. The host may
already have applied the captured proposal; it remains responsible for authorization and persistence. The reader can submit
the current answers immediately, even if the earlier response is still pending. Next retires obsolete validation in the same
way. Reset and destruction also retire pending navigation and submission waits. Retiring browser state does not cancel the
host's work or undo a write. Public validation retries changing answers a bounded number of times; if it cannot obtain a
stable snapshot, it reports a generic failure and does not attach errors from an earlier answer.

`setProgress` and `complete` target the flow's current accepted operation. If host work can outlive `reset()` or reuse of the
flow, the host must stop forwarding that earlier work's progress and completion callbacks.

| Event | Cancelable | Detail |
| --- | --- | --- |
| `canopyx:flowReady` | | `{ flow, step }` |
| `canopyx:flowStepChanging` | yes | `{ from, to, direction }` |
| `canopyx:flowStepChanged` | | `{ from, to }` |
| `canopyx:flowValueChanged` | | `{ field, value, previous, source }`; for secrets only `{ field, source }` |
| `canopyx:flowSubmit` | yes | the `flowSubmission` with `respondWith(answer)` and `secret(id)` |
| `canopyx:flowSubmitted` | | the host's answer |
| `canopyx:flowReload` | | `{ baseline }` |
| `canopyx:flowCheck` | | `{ check, result: { status, message, details, at } }` |
| `canopyx:flowLeaving` | yes | `{ reason: "close" }`: a dialog or drawer flow is closing with changed answers |
| `canopyx:error` | | `{ error, hook }` |

Every hook runs isolated: an exception or rejection becomes an `error` event and a message in place, and the flow keeps
working. Cancelling `flowSubmit` with `preventDefault()` leaves the flow on the review page.

TypeScript types: `FlowDocument`, `FlowField`, `FlowCondition`, `FlowSubmission`, `FlowAnswer`, `FlowApi`, `FlowOptions`,
`FlowHooks`, `FlowCheckResult`, `FlowStepState`, `FlowPreview`, `FlowDraft` and `FlowPickedRecord` from `@evotecit/canopyx/flow`.

## Labels and right to left

The texts the flow writes itself are the `flow…` labels, translated in the five label packs (`CanopyLabels.Polish()` and
the others, `@evotecit/canopyx/locales/pl` and the others) together with the shared `gridEdit…` messages. A flow written
with `Labels = CanopyLabels.German()` carries them in its document. The labels of a host-connected feature come with its
part; a flow that does not use the feature ignores them. The stylesheet uses logical properties only, so a page
with `dir="rtl"` mirrors the rail, the fields and the action bar.

## Accessibility

- The rail is a `nav` with an ordered list; the current step has `aria-current="step"` and locked steps say why.
- Each step is a section labelled by its heading. On a step change focus moves to the heading and a polite live region
  says "Step 3 of 5, Certificate checks".
- Fields have real labels; help and messages are linked with `aria-describedby`, errors set `aria-invalid`, and the
  step's error summary is an alert with links to the fields.
- Choice cards are native radio buttons (arrow keys move), multiple choice is a group of check boxes with a live count.
- Enter in a single-line field moves to the next step; Ctrl+Enter submits from the review page.
- Pointer targets are at least 24 px, 44 px on phones; forced colours and reduced motion are respected.

A screen-reader speech pass (NVDA, Narrator) is backlog by owner decision; ARIA and keyboard support are designed in and
covered by the automated checks.

## Packaging and size

| Asset | What it holds | Size guard (gzip) |
| --- | --- | --- |
| `canopyx-flow-entry.js`, `canopyx-flow-entry.css` | The flow entry point: the theme tokens, the part loader, `createFlow`, `configure`, the fragment mount, and which feature parts a document needs. No grid or tree code. `@evotecit/canopyx/flow` is its ES module. | 10 KiB (9.7 KiB measured) |
| `canopyx-forms.js`, `canopyx-forms.css` | The `forms` part: the typed editors, number and date parsing, the lookup combobox and the field checks. Grid editing requires it too. | 7 KiB (5.4 KiB) |
| `canopyx-flow.js`, `canopyx-flow.css` | The `flow` part: the document reader, conditions, fields, steps, validation, the review page and the proposal. | 29 KiB (28.9 KiB) |
| `canopyx-flow-host.js`, `.css` | What the host-connected parts share: hooks with a timeout, answers the flow sets itself, loading lines. The parts marked † require it. | 3 KiB (1.9 KiB) |
| `canopyx-flow-checks.js`, `.css` † | [Server checks](#server-checks). | 6 KiB (4.4 KiB) |
| `canopyx-flow-options.js` † | [Host options, dependent fields](#host-options-and-dependent-fields) and host sections. | 4 KiB (3.2 KiB) |
| `canopyx-flow-pick.js`, `.css` † | [Pick steps](#pick-steps) and their tray. | 5 KiB (3.8 KiB) |
| `canopyx-flow-records.js`, `.css` | [Records fields](#records-fields). | 5 KiB (3.5 KiB) |
| `canopyx-flow-drafts.js`, `.css` † | [Drafts](#drafts) and [presets](#presets). | 6 KiB (4.6 KiB) |
| `canopyx-flow-preview.js`, `.css` † | The host's [preview](#the-preview-and-consent-on-the-review-page). | 2 KiB (1.7 KiB) |
| `canopyx-flow-command.js`, `.css` | The [equivalent command](#the-equivalent-command) and the JSON patch. | 4 KiB (3.4 KiB) |
| `canopyx-flow-tasks.js`, `.css` † | [Task lists](#task-lists). | 5 KiB (4.0 KiB) |
| `canopyx-flow-dialog.js`, `.css` † | [Dialogs and drawers](#dialogs-and-drawers). | 3 KiB (2.1 KiB) |
| `canopyx-flow-links.js` † | [Deep links](#deep-links). | 2 KiB (1.1 KiB) |
| `canopyx-flow-endpoint.js` † | [An endpoint](#an-endpoint-mapcanopyflow) that answers the hooks. | 2 KiB (1.6 KiB) |
| `canopyx-flow-consent.js`, `.css` | The review page's [typed confirmation and acknowledgement](#the-preview-and-consent-on-the-review-page). | 3 KiB (1.9 KiB) |

A plain form loads the entry point, `forms` and `flow` only. A feature part loads with them when the document uses its
keys (a step's `checks`, a field's `source` or `dependsOn`, a pick step, a records field, `presets` or `draft`, a review
step's `"preview": true`, `command`, `"mode": "tasks"`, a layout `container`, `deepLinks`, `endpoint`, a review step's
`confirm` or `acknowledge`). `CanopyHtmlAssets.GetRequiredParts(CanopyFlow)` makes the same decisions, so a single-file page
carries exactly those payloads. A preview hook or a preset store alone loads its part too; a page that cannot load it shows
the flow without the feature.

A page with only flows includes the flow entry point; the parts load on first use from the files beside it, or from the
payloads a single-file page carries. The data-grid and reporting entry points know the same parts, so a grid page creates
flows with `CanopyX.createFlow` and mounts flow fragments without a second entry point. A single-file grid page that creates flows from script carries the parts too: add `"flow"` to `CanopyHtmlOptions.Parts` (it brings `forms`), and the feature parts its flows use (`"flow-checks"`, which brings `flow-host`, …), since there are no files beside the page to load them from. Include one entry point per page.
`CanopyX.Html` writes flow pages with the flow entry point (`CanopyRuntime.Flow`), or with the reporting entry point when a pick step embeds a grid or tree (`CanopyHtmlAssets.GetRuntime(CanopyFlow)`); `CanopyHtmlAssets.GetRequiredParts(CanopyFlow)` adds the parts the embedded views need.
