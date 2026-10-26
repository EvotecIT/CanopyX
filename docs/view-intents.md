# View intents

A host can propose a grid view as data, validate it against the actual columns, and let the reader inspect chips before
applying it. CanopyX supplies the schema, validator and preview. It never calls a language model, chooses a model,
reads credentials, or sends the proposal to a service. A host can obtain proposals from a form, a saved workflow, or
its own model integration.

Enable `CanopyDataGridView.ViewIntents` in C#, or `viewIntents: true` in the grid document. This opts into the separate
`view-intents` part. Ordinary grids carry no preview payload. `CanopyX.Html` includes the part and its stylesheet in an
opted-in single-file fragment; external hosts serve the part files beside their runtime.

```js
const proposal = {
  protocol: "canopyx/2", type: "viewIntent", version: 1, view: grid.view.id,
  query: {
    filters: [{ column: "stage", operator: "eq", values: ["Active"] }],
    sort: [{ column: "name", direction: "asc" }]
  },
  columns: ["name", "stage", "units"]
};
const preview = await grid.applyViewIntent(proposal);
// The grid now shows chips and Apply/Cancel controls. Its accepted query is unchanged.
// A host may also connect its own explicit confirmation control to preview.apply().
```

`applyViewIntent(state)` validates and previews. It does not bypass confirmation. The returned `preview.apply()` is a
one-use operation that applies the captured state through the existing query and saved-view methods. `preview.cancel()`
closes it without changing the view. `previewViewIntent(state, element)` places the same preview in a connected host
element outside the grid rows. The default preview sits immediately after the grid host, so a fixed-height grid
retains its full data viewport. An explicit container keeps the placement supplied by the host. The preview preserves
outside focus and supports keyboard Apply and Cancel.

`await grid.getViewIntent()` exports the accepted query, ordered visible columns and the pivot definition for opted-in views. `await grid.validateViewIntent(input)`
returns a validated snapshot without making a query or changing preferences. Exported intents omit paging cursors,
dataset revisions, selection and scroll position. Missing query fields preserve accepted values; an empty array clears
that setting, and `filterGroup: null` clears nested conditions. A new accepted query, changed presentation state,
destroyed grid or consumed handle invalidates the old preview. Editing the caller's object after preview changes
neither the chips nor the proposal that will be applied.

## Schema and target validation

The independently versioned [view-state schema](schema/canopyx-view-state-1.schema.json) defines JSON-only proposals.
It describes the search query, typed filters, sort, bucketed grouping, visible column order and pivot axes/values. Structural schema validation is
followed by target-aware validation: column IDs must exist and permit the requested operation, operators and operand
types must match their columns, and the ordinary grid predicate and grouping limits apply to the merged query too.
Version 1 accepts the built-in filter operators listed in its schema; host-defined query operators are outside this intent version.
Unknown fields, executable content, endpoints, unknown operators and empty proposals fail before preview. Proposals
are bounded to 65,536 UTF-16 code units and retain the grid's nesting and predicate limits.

The C# boundary uses the same contracts:

```csharp
using CanopyX;

CanopyViewIntent proposal = CanopyViewIntentValidator.Validate(json, view);
string validatedJson = proposal.ToJson();
```

The returned object owns an immutable, HTML-safe JSON snapshot. It grants no access to data and does not change the
definition. The browser revalidates against its own target definition before preview and apply. Hosts must still
enforce authorization on every normal query: hiding a column is a presentation choice, not a security boundary.

## Pivot and bucket proposals

A pivot-enabled reporting view accepts a top-level `pivot` definition with the same bounded rows, columns, values,
column cap, optional top-N and total sort as [pivot analysis](pivot.md). Its axes can use calendar or numeric buckets.
A definition activates or replaces the pivot; `pivot: false` returns to records. Omitting `pivot` preserves the current
mode. A pivot-only proposal is valid. Runtime preferences such as `active`, collapse keys and the compact column picker
are excluded from proposals and exported intents.

```js
const preview = await grid.applyViewIntent({
  protocol: "canopyx/2", type: "viewIntent", version: 1, view: grid.view.id,
  pivot: {
    rows: [{ column: "stage", direction: "asc" }],
    columns: [{ column: "created", direction: "asc", bucket: { kind: "month", timeZone: "UTC" } }],
    values: ["count"], maxColumns: 24,
    sortByTotal: { aggregate: "count", direction: "desc" }
  }
});
```

Preview chips name both axes, values, bucket settings and explicit caps before Apply. They use the reporting view's
localized labels. The target's existing pivot and group validators check column capabilities, aggregate identities and
bucket bounds. Bucket predicates and exact correlated `tupleFilters` from pivot drill-through also roundtrip;
`tupleFilters: []` clears those predicates without broadening other criteria. Exported snapshots always include that
array, so replaying an unrestricted export clears newer drill-through restrictions. Raw datetime operands in intents
use UTC timestamps; export converts accepted explicit-offset datetime tuples to the equivalent UTC instants. There is no second analysis engine in the intent part. Grouping proposals use the same optional `bucket`
on each `query.groupBy` level. As with other query changes, the host retains authorization and rejection control.

## Read-only IntelligenceX tool integration

The IX host registers its view-proposal tool as **read-only** under its tool-governance policy.
The tool accepts only the versioned view-intent document, validates it against
the authorized target view, and passes the resulting snapshot to `applyViewIntent`. It returns preview information;
the reader applies it in the grid. It has no edit, transaction, action, command or dataset-write route. Do not attach
a write execution contract or accept `allow_write` as a way to turn this tool into a write tool.

Model calls, tool registration, caller identity, accessible datasets, query authorization and audit retention stay in
IntelligenceX or the application host. CanopyX takes no dependency on IX and supplies no model endpoint or transport.
Preview and validation make no network requests. Applying a proposal can execute the grid's existing host query, which
retains its usual authorization, cancellation and transport policy. Optional runtime assets can load on first use.

The gallery's `data-views.html` supplies a fixed proposal from a button, so it works offline and demonstrates the same
host boundary without an external service.
