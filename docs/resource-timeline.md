# Resource timeline

The resource timeline is the [calendar](calendar.md)'s view for work that belongs to things: incidents and maintenance per host,
certificate expiries per issuer, shifts per engineer. Resources are rows, time runs across, and the resources are an ordinary
CanopyX tree, so they group (site, then role, then host), expand and collapse, load children lazily, sort and filter as any tree
does. Group rows show how many events run at once; tree columns can show each resource's event count, busy hours and overlaps.

`calendar-timeline.html` shows incidents per host grouped by site and role, `calendar-certificates.html` certificate expiries
per issuer at month zoom, `calendar-passwords.html` password expiries per person, and `calendar-resources.html` resource
columns in the day view.

## Resources

```csharp
var tree = new CanopyTreeView("hosts", "Hosts") { Selection = CanopySelectionMode.Single };
tree.Columns.Add(new CanopyColumn("name", "Host"));
tree.Columns.Add(new CanopyColumn("events", "Events") { Kind = CanopyColumnKind.Number });
tree.Columns.Add(new CanopyColumn("busy", "Busy") { Kind = CanopyColumnKind.Number });
var site = new CanopyNode("site-warsaw", "Warsaw") { Expanded = true };
site.Children.Add(new CanopyNode("waw-web-01", "waw-web-01"));
tree.Roots.Add(site);

grid.View.Calendar = new CanopyCalendar("starts") {
    End = "ends", Title = "title", Status = "kind", Resource = "host", View = CanopyCalendarView.Timeline, Zoom = CanopyCalendarZoom.Day,
    Resources = new CanopyCalendarResources(tree) { Label = "Hosts", Width = 360 },
    Capacity = new CanopyCalendarCapacity().Add(4, CanopyTone.Warning).Add(7, CanopyTone.Danger)
};
grid.View.Calendar.Resources!.Aggregates["events"] = CanopyCalendarAggregate.Count;
grid.View.Calendar.Resources!.Aggregates["busy"] = CanopyCalendarAggregate.Busy;
```

`resources` is `{ view, width?, label?, aggregates? }`:

| Field | Meaning |
| --- | --- |
| `view` | A tree `view` document: inline roots, or a remote source whose children load when a group opens. Node ids are the resource ids the grid's `resource` column holds. Its columns are extra resource columns (site, owner), sortable and filterable as tree columns. |
| `width` | The resource pane's width, 120–800 pixels (default 280; phones use 176 and show names only). |
| `label` | The resource pane's heading in print (default "Resources"). |
| `aggregates` | Tree column ids filled with `count` (events in the visible span), `busy` (hours covered, overlapping events counted once) or `overlap` (events that overlap another). A group adds up its resources. |

The tree's own toolbar is off; its rows, the lanes and the time header share heights, and the lanes drive the tree's scrolling,
so a resource and its lane always line up. Its events (`select`, `toggle`) stay inside the calendar.

## Zoom

| Zoom | Unit | Span the arrows step by | Header |
| --- | --- | --- | --- |
| `hour` | an hour | a day | the date over the hours |
| `day` | a day | a month | the month over the days |
| `week` | a week | a quarter | the month over the weeks |
| `month` | a month | a year | the year over the months |
| `quarter` | three months | three years | the year over the quarters |

`zoom` is the first zoom (default `day`) and `zooms` the ones the zoom list offers. Units are wall-clock periods of the display
zone, so a day stays one unit wide when DST makes it 23 or 25 hours long. The larger period's name stays in view while the axis
scrolls; weekends are shaded at day zoom.

## Lanes

- Only the lanes of the rows the tree shows exist, with the events and cells inside the visible width plus a margin, so 5,000
  resources and 100,000 events scroll as smoothly as twenty.
- Overlapping events of a resource stack in up to four sub-rows.
- Zero-length events are diamonds; past the hour zoom their names move to the tooltip and the accessible name, since
  neighbours sit too close for them.
- Business hours (`availability`) shade the time outside them at hour zoom; `ranges` with a `resource` shade that resource's lane
  (`unavailable` ranges hatched), and ranges without one tint the whole span, named in a third header row.
- A line marks now.

### Capacity

A group's lane shows its capacity instead of events: for each unit, the most events running at once among its resources (and
their descendants), as a number in a cell shaded by how full it is. `capacity: { thresholds: [{ at, tone }], label? }` tones a
cell when the count reaches a threshold, for example warning from four hosts down at once and danger from seven. The lane's
accessible name gives the highest count.

## Business hours and availability

`availability` is a list of `{ resource?, days?, start, end }`. Entries with a `resource` are that resource's business hours; a
resource without entries takes its parent group's, then the entries without a resource. Week and day views with resource columns
shade each column outside its resource's hours, the timeline does at hour zoom, and `editable.workingHours` refuses drops outside
them.

## Resource columns in day and week views

When the resources have at most 24 leaves, day and week views show one column per leaf resource (per day, in the week view), under
a header of their group (a team, a site). Events sit in the column of their resource, each column is shaded by its resource's
business hours, and dragging an event to another column changes its resource. Events without a resource, or with one the tree does
not have, are not shown in these views or in the timeline (which has no row for them); the month, agenda and year views still
show them.

## Keyboard and screen readers

The lanes are an ARIA grid with a row per resource the tree shows and a gridcell per unit. Left and Right move by unit (past the
span they step to the next span), Up and Down by resource, Home and End to the first and last unit, Page Up and Page Down by span.
Enter goes to the first event in the unit; Left and Right then move between the lane's events, Enter opens one and Escape returns.
Space selects the unit of that resource, and selecting a resource in the tree selects it for the whole span; both report
`canopyx:linkchange` with the resource in `values` and the range. Each lane's accessible name gives the resource and its number of
events (and a group's capacity); each cell gives the resource and the unit. The tree keeps its own tree grid keyboard model.

## Editing

With `editable`, events move along their lane and across lanes to another resource (`editable.resources`, default true), and
change their start or end at either edge, snapped to the calendar's `snapMinutes` at hour zoom, to an hour at day zoom and to a day
beyond. In the keyboard move mode (F2) Alt with Up or Down moves the event to the previous or next resource. The rules (no
overlap on a resource, allowed resources, business hours) and the editing contract are the calendar's ([Editing](calendar.md#editing)).

## Server data

A hosted timeline names the visible resources (the expanded rows in view, at most 1,000) in its `gridRangeQuery`, so a server
reads only their records, and loads again as the reader scrolls to other resources or another span; the first load already names the
resources of the first screen. The tree's own source loads the resources themselves. A group's aggregates and capacity add up
the records loaded for its visible resources, so on a hosted timeline they cover the resources in view, not every resource of the
group.

## Print

Printing writes a static copy: the resources the tree shows (indented, at most 400), each with its events as bars placed by their
share of the span across the page width, the units of the span as a header, and the capacity of groups as numbers. Nothing is cut
off by the scrolled axis or the virtual rows.

## Parts

The timeline ships in the `timeline` part (`canopyx-timeline.js` and `.css`), which requires the `calendar` part. A calendar with
resources loads both, and the tree loads the tree tools part as every tree does; single-file pages carry all three. Its gzip size
is reported with the calendar's in [calendar.md](calendar.md#parts-and-sizes).
