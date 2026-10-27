# Task plans

A plan adds task bars, milestones, finish-to-start arrows, critical-path emphasis and baseline comparison to the calendar's resource timeline. Records supply tasks; the calendar maps their actual start, finish, title and resource. The same grid keeps search, filters, saved views and record details.

```csharp
view.Calendar = new CanopyCalendar("starts") {
    End = "ends", Title = "title", Resource = "team",
    Resources = new CanopyCalendarResources(teams),
    View = CanopyCalendarView.Timeline
};
view.Calendar.Views.Add(CanopyCalendarView.Timeline);
view.Plan = new CanopyPlan {
    BaselineStart = "baselineStart",
    BaselineEnd = "baselineEnd",
    Milestone = "milestone",
    ProposeMoves = true
};
view.Plan.Dependencies.Add(new CanopyPlanDependency("prepare", "migrate"));
view.Plan.Dependencies.Add(new CanopyPlanDependency("migrate", "verify") {
    Lag = TimeSpan.FromHours(2)
});
```

Declare the mapped grid columns first. Actual and baseline date columns use `CanopyColumnKind.DateTime`. Resource and milestone columns use `Text`; milestone cells contain booleans. Baseline start and finish are set together. A zero-duration task is a milestone even without a milestone column; a `true` milestone cell represents a point at the actual start, regardless of its end cell. Dependency endpoints are stable grid row IDs. Duplicate edges, self-links, cycles, negative lag and missing inline task IDs are invalid.

Plans use ordinary task records. Recurrence and calendar feeds are not supported. Resource groups, lane virtualization, zoom levels and the keyboard grid come from the [resource timeline](resource-timeline.md). The optional `plan` browser part loads only for plan definitions and depends on the timeline part.

On wide screens the time columns stretch to fill the available range, and the frame fits its resource rows. The current day has a labelled accent line when it falls within the range. Routed dependency connectors show arrowheads and highlight on hover; the legend names both critical paths and conflicts. Short bars keep their full task name in a tooltip and display a label beside the bar.

Narrow hosts show an agenda grouped by resource lanes. Each task lists its dates, predecessor count, criticality, milestone and conflict state. Its title opens the same calendar record details as the desktop task. Resource headings retain expand/collapse controls, including for lazily loaded groups. The agenda indexes accepted tasks once and mounts at most 50 entries per page, keeping large plans bounded. Keyboard date and resource proposals retain the same Alt+Arrow shortcuts. The optional plan part has a 12 KiB combined script/style gzip budget, including both presentations. Content fitting preserves the host's authored height and maximum height; `AutoHeight = false` keeps the full host viewport.

## Dependencies and critical path

An arrow runs from a predecessor's actual finish to its successor's actual start. Dashed emphasis marks a successor that starts before its predecessor finishes plus any lag. The task buttons retain their accessible names; milestones, criticality and baseline dates are included in those names.

Critical-path analysis computes the longest elapsed-duration path through the dependency graph. Lag contributes to that path. It does not reschedule records or infer business calendars, constraints, product policy or dates from task names. Actual gaps between tasks do not increase their durations. A shorter parallel branch has slack and is not marked critical. Multiple equal longest branches can be critical.

For an inline source, analysis uses every task in the definition, including tasks outside the visible date range or current filters. Navigation and filtering do not redefine the critical path. A hosted calendar range cannot prove that all tasks and edges were loaded, so it omits authoritative critical-path marking and reports an incomplete-network warning with proposals. The host checks the complete graph before applying any proposed change.

A thin baseline line in its own inset below each actual bar shows the mapped baseline interval. Missing, invalid or zero-duration baseline intervals omit that task's line; actual dates remain visible. The baseline is comparison data and never changes when a proposal is made.

## Proposals belong to the host

`ProposeMoves` defaults to `false`. When enabled, drag a task to preview new dates and a resource, or focus its button and use Alt+Left/Right to propose a date and Alt+Up/Down to propose a resource. Escape cancels a drag. Hour zoom snaps to the calendar slot size; wider zooms move by local calendar days. Right-to-left layouts mirror horizontal movement.

The preview marks dependency violations, overlapping tasks when `AvoidOverlap` is enabled, invalid resources, the calendar's valid range and unavailable ranges. These checks help the user; they do not authorize a write. The callback receives all observed conflicts, including an incomplete-network warning for hosted ranges.

```javascript
const api = CanopyX.createDataGrid(element, {
  view,
  plan: {
    async propose(proposal, { signal }) {
      // Present the proposal to the user or pass it to the host's governed workflow.
      await reviewTaskMove(proposal, { signal });
    }
  }
});

element.addEventListener("canopyx:planChangeProposal", event => {
  // preventDefault() cancels callback delivery. It does not change task records.
});
```

The payload is:

```json
{
  "id": "migrate",
  "previous": {
    "start": "2026-10-14T00:00:00.000Z",
    "end": "2026-10-18T00:00:00.000Z",
    "resource": "platform"
  },
  "proposed": {
    "start": "2026-10-13T00:00:00.000Z",
    "end": "2026-10-17T00:00:00.000Z",
    "resource": "platform"
  },
  "conflicts": [
    {
      "kind": "dependency",
      "id": "prepare",
      "label": "Dependency conflict with Prepare migration"
    }
  ]
}
```

Conflict kinds are `dependency`, `overlap`, `unavailable`, `range`, `resource` and `incomplete`; `id` is null when the conflict does not identify another task. Dates are UTC ISO strings. The payload is frozen before delivery. The callback receives the grid's bounded hook signal: a new query, disposal or the configured request timeout aborts it.

Neither an uncanceled event nor a callback return value accepts a proposal. Missing callbacks, successful callbacks, rejected callbacks and canceled gestures leave actual records unchanged. The calendar's ordinary move and resize permissions remain disabled for a plan, including when proposals are disabled or a callback is pending. Calendar creation and external drops are not supported in plan definitions. CanopyX calls no writer from task gestures. The host performs its authorization, full-network conflict checks, confirmation and persistence, then refreshes the records through its ordinary grid data flow.

## Static output and print

`CanopyStaticHtml.RenderGrid` and `RenderGridWithResult` render plan definitions as script-free tables with inline styles. They include task/resource names, actual dates, baseline dates, milestone text, criticality and dependency conflicts. Inline analysis includes the full graph before the static row limit is applied. Hosted fallbacks require an explicit page snapshot and mark the network incomplete. Row limits and full-report links use the normal static renderer options.

Browser print produces a task table for the visible resource rows. It includes milestones and conflict text rather than relying on arrows or color. The after-print hook removes that copy. Labels use the shared `Plan*` properties and browser label packs; task and resource names remain host data.

`PlanExample.cs` writes `plan.html`, `plan-dark.html` and `plan-static.html` with a migration, a parallel runbook task, baseline dates and a release milestone that starts before verification finishes.
