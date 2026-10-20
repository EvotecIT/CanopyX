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
| `mode` | `linear` (default): a step opens when the steps before it are valid. `free`: any visible step opens at any time and the review page checks everything. |
| `layout` | `{ "orientation": "auto" \| "horizontal" \| "vertical" }`. `auto` (default) uses the horizontal stepper for up to six visible steps whose titles fit the width, and the vertical one otherwise. Narrow hosts (below 640 px) stack the steps; a flow with one visible step shows no rail. |
| `density` | `compact`, `normal` (default) or `comfortable`, as the grid densities. |
| `timeZone` | `utc` (default) or `local`: the zone date-and-time fields show and enter. |
| `steps` | 1 to 64 steps. A `review` step, when present, is the last. |
| `initial` | Edit mode: the values the flow edits, by field id (see [Edit mode](#edit-mode)). |
| `storedSecrets` | Edit mode: ids of secret fields that already have a stored value. Never the values. |
| `baseline` | Edit mode: the host's revision of the edited settings, echoed in the proposal. |
| `submit` | `{ "label" }`: the submit button's text. Default "Submit". |
| `labels` | Translations of the texts the flow writes itself (`flow…` and the shared `gridEdit…` messages). |

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
| `type` | `form` (default), `info` (text only) or `review` (the [review page](#the-review-page)). |
| `fields`, `sections` | The step's fields, then its sections. A section has `id`, `label`, optional `description`, `fields` and `when`, and uses the record panel's label/value layout. |
| `when` | A [condition](#conditions): the step shows only while it holds. |
| `optional` | The rail marks the step optional. Its fields still follow their own `required`. |
| `declaration`, `changesOnly` | Review steps only: text above the submit button, and whether edit mode shows only changed answers first (default true). |

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
| `parameter` | The parameter name in an equivalent command (used by hosts and later waves). |
| `path` | The setting the field writes, as dot-separated names (`mail.smtp.host`): the JSON patch of the proposal uses it. |
| `sensitive` | A non-secret value the host keeps out of drafts and exports. It still shows on the review page. |
| `validation` | The checks below. |

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

## JavaScript API

```js
const flow = CanopyX.createFlow(host, {
  flow,                     // the document
  values,                   // starting values on top of defaults or initial
  labels,
  hooks: { validators: { host(value, values) {} }, validateStep(stepId, values) {}, validateFlow(values) {}, submit(detail) {} },
  editors: { stars: { create(context) {} } },
  onReady, onStepChange, onValueChange, onSubmit, onSubmitted, onReload
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
| `canopyx:error` | | `{ error, hook }` |

Every hook runs isolated: an exception or rejection becomes an `error` event and a message in place, and the flow keeps
working. Cancelling `flowSubmit` with `preventDefault()` leaves the flow on the review page.

TypeScript types: `FlowDocument`, `FlowField`, `FlowCondition`, `FlowSubmission`, `FlowAnswer`, `FlowApi` and `FlowOptions`
from `@evotecit/canopyx/flow`.

## Labels and right to left

The texts the flow writes itself are the `flow…` labels, translated in the five label packs (`CanopyLabels.Polish()` and
the others, `@evotecit/canopyx/locales/pl` and the others) together with the shared `gridEdit…` messages. A flow written
with `Labels = CanopyLabels.German()` carries them in its document. The stylesheet uses logical properties only, so a page
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
| `canopyx-flow-entry.js`, `canopyx-flow-entry.css` | The flow entry point: the theme tokens, the part loader, `createFlow`, `configure` and the fragment mount. No grid or tree code. `@evotecit/canopyx/flow` is its ES module. | 10 KiB (8.1 KiB measured) |
| `canopyx-forms.js`, `canopyx-forms.css` | The `forms` part: the typed editors, number and date parsing, the lookup combobox and the field checks. Grid editing requires it too. | 7 KiB (5.2 KiB) |
| `canopyx-flow.js`, `canopyx-flow.css` | The `flow` part: the document reader, conditions, fields, steps, validation, the review page and the proposal. | 29 KiB (24.8 KiB) |

A page with only flows includes the flow entry point; the parts load on first use from the files beside it, or from the
payloads a single-file page carries. The data-grid and reporting entry points know the same two parts, so a grid page creates
flows with `CanopyX.createFlow` and mounts flow fragments without a second entry point. A single-file grid page that creates flows from script carries the parts too: add `"flow"` to `CanopyHtmlOptions.Parts` (it brings `forms`), since there are no files beside the page to load them from. Include one entry point per page.
`CanopyX.Html` writes flow pages with the flow entry point (`CanopyRuntime.Flow`, `CanopyHtmlAssets.GetRequiredParts(CanopyFlow)`).
