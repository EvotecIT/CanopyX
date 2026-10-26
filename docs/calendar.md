# Calendar

A flat grid can show its records as a calendar: month, week, day, a run of N days, an agenda and a year overview, the simple
layouts (a mini month, week and day lists, stacked months), and a timeline, by resource or on its own
([resource timeline](resource-timeline.md)). The calendar is a presentation of the grid, not a separate widget. The
grid's toolbar (search, filters, columns, saved views, export), its query line and chips, the record panel, facets, linked views,
live data and editing all work on the same records, so a calendar picks up every grid feature a page already uses. It is
another view to choose; nothing else changes.

Most pages need less than that. A **basic calendar** takes a list of events and shows them read-only, with nothing else to
set up; every other capability is one option away. Start with the [quick start](#quick-start).

`calendar-basic.html` is a basic calendar; `calendar-layouts.html`, `calendar-scheduler.html`, `calendar-rtl.html` and
`calendar-solo.html` turn on one option at a time. The `calendar.html` example is an operations calendar written from typed records. `calendar-timeline.html`,
`calendar-resources.html`, `calendar-certificates.html`, `calendar-passwords.html` and `calendar-linked.html` show the
resource timeline, resource columns, a facet panel with thousands of certificate expiries, an all-day agenda and a calendar
linked with a grid. `calendar-pl.html` and `calendar-de.html` show the Polish and German label packs.

## Quick start

A list of events is enough. Each event has a title and a start; an end, `allDay`, a description and a tone are optional, and a
`yyyy-MM-dd` start makes an all-day event.

```js
CanopyX.createCalendar(document.getElementById("calendar"), {
  events: [
    { title: "Sprint planning", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:30:00Z", description: "Pick the next work." },
    { title: "Conference trip", start: "2026-10-20", end: "2026-10-23" }
  ]
});
```

```csharp
var calendar = new CanopyCalendar(new[] {
    new CanopyCalendarEvent("Sprint planning", new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc), new DateTime(2026, 10, 16, 10, 30, 0, DateTimeKind.Utc)),
    new CanopyCalendarEvent("Conference trip", new DateTime(2026, 10, 20)) { AllDay = true, End = new DateTime(2026, 10, 23) }
});
calendar.SaveHtmlPage("team.html");
// Or from your own records:
var fromItems = CanopyCalendar.From(meetings, x => x.Subject, x => x.Starts, x => x.Ends);
```

That is a basic calendar: month, week, day and agenda; the calendar's own controls (Today, previous and next, the range, go to
date, the views) and no grid toolbar; read-only; clicking an event opens a small popover with its title, time and description.
The page loads only the core calendar part. Events may also carry `id`, `tone`, `resource`, `resourceIds`, `recurrence`, `exceptions`, `series`, `recurrenceId` and
`source`; ids default to `e1`, `e2`, ... in order.

## Levels and options

Every advanced capability is opt-in, through one option each. Three presets set sensible defaults, and each option given beside
a preset wins over it.

| Preset | What it sets |
| --- | --- |
| `basic` (the default) | No grid toolbar, a details popover, the month, week, day and agenda views, read-only. |
| `standard` | Search, filters and export above the calendar, a details popover, a Print button, and the month, week, day, 3-day, agenda and year views. |
| `scheduler` | Search, filters, saved views and export, the record drawer, a Print button, moving, resizing and creating events, the month, week, day and agenda views, and with resources the timeline with a concurrency lane (warning from 3 events at once, danger from 5). |

```js
CanopyX.createCalendar(host, { events, preset: "scheduler", drop: true, sources: [...] });
CanopyX.createCalendar(host, { events, calendar: { weekNumbers: "iso", validRange: { start: "2026-01-01" } } });
```

`createCalendar` takes `events`, `preset`, `id`, `label`, `views`, `view`, `date`, `timeZone`, `firstDay`, `toolbar`,
`details` (or `drawer: true`), `export`, `editable`, `create`, `drop`, `print`, `sources`, `resources` (a tree document or a
list of `{ id, label, parent }`), `timeline`, `live`, `facets` and `links`; `calendar` takes any other key of the definition below
(its functions are the host hooks: `render`, `menu`, `occurrence`), and the rest are grid options (`editing`, `onCreate`, ...).
In C#, `CanopyCalendar` has a property for each, `ApplyPreset(...)`, and the presets as a constructor argument. The protocol
carries the resolved keys, never a preset name.

| Capability | Option |
| --- | --- |
| Grid toolbar controls | `toolbar`: `true`, `false` or a list of `search`, `filters`, `columns`, `views`, `export`, `more` |
| Details popover or record drawer | `details`: `popover` or `drawer` |
| Moving and resizing | `editable` ([Editing](#editing)) |
| Creating events | `create` ([Creating events](#creating-events)) |
| Dropping grid rows and page elements | `drop` ([Dropping events](#dropping-events)) |
| Changing one occurrence of a series | `occurrence` ([Changing one occurrence](#changing-one-occurrence)) |
| Simple layouts | `views`: `mini`, `weekList`, `dayList`, `months`; `months`, `yearEvents`, `agendaSpan` |
| Week numbers, day links, valid range, six weeks, outside days | `weekNumbers`, `navLinks`, `validRange`, `fixedWeeks`, `outsideDays` |
| Timeline span; a timeline without resources | `span`; `views: ["timeline"]` |
| Several sources with a legend, iCalendar files | `source`, `sources` ([Sources and iCalendar](#sources-and-icalendar)) |
| Shading the time outside ranges | `ranges[].inverse` |
| Context menus and hover cards | `menu`, `hover` (both on by default) |
| Print button | `print` |

## The calendar definition

A grid becomes a calendar when its definition carries `calendar`. The only required field is `start`, the date column with
each event's start; everything else names other columns or sets how the calendar looks.

```csharp
var grid = new CanopyDataGridView<Operation>("operations", "Operations", item => item.Id);
grid.Column(x => x.Title, configure: column => column.RowHeader = true);
grid.Column(x => x.Status, configure: column => column.Presenter = CanopyGridPresenter.State(tones));
grid.Calendar().Start(x => x.Starts).End(x => x.Ends).Title(x => x.Title).Status(x => x.Status)
    .AllDay(x => x.AllDay).Resource(x => x.Host).Recurrence(x => x.Rule);
grid.View.Calendar!.Views.Add(CanopyCalendarView.Month);   // and Week, Day, Days, Agenda, Year, Timeline
```

```js
CanopyX.createDataGrid(host, { view: { ...gridDefinition, calendar: { start: "starts", end: "ends", title: "title", status: "status" } } });
```

The typed `Calendar()` builder adds a column for a member the grid has not declared yet (hidden for technical members such as
the recurrence rule), and `Definition` holds every other setting. `CanopyCalendar` writes the same object untyped.

| Field | Meaning |
| --- | --- |
| `start` | Date column with the event's start. Required. |
| `end` | Date column with the end. A missing end, or an end before the start, makes a zero-length marker. |
| `title`, `subtitle` | The event's text: the title (default: the row header column, else the first visible column) and a second line. |
| `allDay` | Text column holding booleans. An all-day event is a run of dates: its start and end read as UTC dates, the end exclusive at midnight, as an iCalendar `DTEND`. A password that expires on 2026-10-16 shows on the 16th in every time zone. Without an end it lasts its start day. |
| `status` | The column whose presenter draws the event's status (pills and tones from the grid's presenters); its tone colours the event. |
| `resource` | Text column with the event's resource id, a node id of `resources.view`. |
| `resourceIds` | Text column containing a JSON array of resource ids. Assignments join `resource`, with duplicates removed. Basic calendar events take a `resourceIds` array directly (.NET `CanopyCalendarEvent.ResourceIds`). The event keeps one identity in every assigned resource. |
| `recurrence`, `exceptions`, `series`, `recurrenceId`, `seriesEnd` | [Recurrence](#recurrence). |
| `display` | Text column; `background` draws the record as a background range instead of an event. |
| `view`, `views` | The first view and the views offered: `month`, `week`, `day`, `days`, `agenda`, `year`, `timeline`, `mini`, `weekList`, `dayList`, `months`. Default `month`, `week`, `day`, `agenda`, plus `timeline` with resources. |
| `phone` | The view phones start in (default `agenda` when offered). |
| `date` | The first date shown, `yyyy-MM-dd` (default today). |
| `days` | Length of the `days` view, 2–14 (default 3). |
| `firstDay`, `hiddenDays` | First weekday (0 Sunday … 6 Saturday; default the page language's) and weekdays left out (weekends, for example). |
| `slotMinutes`, `minTime`, `maxTime`, `scrollTime` | Slot size of week and day views (5, 10, 15, 20, 30 or 60), the hours shown, and the hour scrolled into view first. |
| `workingHours` | `{ days, start, end }`: time outside it is shaded in week and day views, and `editable.workingHours` keeps events inside it. |
| `nowIndicator` | A line at the current time (default true). |
| `eventLimit` | Events in a month cell before "+N more": 1–20, or `auto` (default) from the row height. |
| `eventStyle` | `quiet` (a tinted block with a tone bar, the default) or `strong` (filled with the tone). |
| `timeZone` | `utc`, `local` or an IANA zone. Default: the grid's `timeZone`, which `setTimeZone` switches. |
| `editable` | Absent: read-only. See [Editing](#editing). |
| `resources`, `zoom`, `zooms`, `capacity`, `availability` | [Resource timeline](resource-timeline.md). |
| `ranges` | Static background ranges `{ start, end, label, tone?, resource?, kind?, recurrence?, inverse? }`: holidays, freezes, maintenance windows (`kind` `background`), or time a resource cannot take events (`unavailable`). `inverse: true` shades the time outside the range instead: outside the union of the inverse ranges of the same resource (or of the global ones), for example office hours with `kind: "unavailable"` and a label that names the shaded time ("Outside office hours"). The month and other day views shade only whole days outside them. |
| `toolbar`, `details` | The grid toolbar controls shown (`true`, `false`, or a list), and what activating an event opens (`drawer`, the default, or `popover`). |
| `description`, `tone`, `source`, `sources` | A description column (popover and hover card), a tone column (a tone name per record, over the status tone), a source column and the sources ([Sources and iCalendar](#sources-and-icalendar)). |
| `create`, `drop`, `occurrence` | [Creating events](#creating-events), [Dropping events](#dropping-events), [Changing one occurrence](#changing-one-occurrence). |
| `weekNumbers` | `iso` or `locale` week numbers in the month, week lists and stacked months (default off). |
| `navLinks` | Day names and numbers open that day in the day view (default true). |
| `validRange` | `{ start?, end? }` (`yyyy-MM-dd`, end exclusive): days outside are disabled, navigation stops at periods without a valid day, and creating and dropping stay inside. |
| `fixedWeeks`, `outsideDays` | The month always shows six weeks; the month shows the days of the months around it (default true; false leaves empty cells). |
| `span` | `{ count, unit }` (`day`, `week` or `month`): the timeline's period instead of its zoom's default, for example two weeks at day zoom. |
| `menu`, `hover` | [Context menus and hover cards](#context-menus-and-hover-cards) (both default true). |
| `yearEvents`, `agendaSpan`, `months`, `print` | The year view lists each month's events; the agenda's period (`day`, `week`, `month` or `year`); the number of stacked months (2–24, default 6); a Print button in the bar. |
| `limit` | Most occurrences one range shows, 1–100,000 (default 20,000); more shows a notice to narrow the period or the filters. |

An unknown field, a column that does not exist or a column of the wrong kind is an error, in the browser and in the C# writer.
The JSON schema is `gridCalendar` in [schema/canopyx-2.schema.json](schema/canopyx-2.schema.json).

## Views

- **Month**: weeks of days. All-day and multi-day events are bars that continue across weeks (cut ends show where a bar
  continues); timed events are one line with their time. A day with more events than fit shows "+N more", which opens the
  day's list. Background ranges tint their days and name themselves on the first one. On phones each day shows dots and the
  list of the focused day sits under the month.
- **Week, day and N days**: a header of days, an all-day row (all-day events and events of a day or longer), then a column of
  time slots. Overlapping events share their column side by side and widen over free columns; an event over midnight shows in
  each day. Working hours, unavailable time and background ranges shade the columns; a line marks now. With an inline resource tree, day and week views get [resource columns](resource-timeline.md#resource-columns-in-day-and-week-views).
- **Agenda**: the period's events grouped by day, with their time (or All day), title, subtitle and status. Phones start here.
- **Year**: twelve small months; each day is shaded by its number of events, which its accessible name and tooltip give.
- **Timeline**: resources as rows, time across; see [resource-timeline.md](resource-timeline.md). Without resources its rows
  are the events themselves, packed by overlap (`calendar-solo.html`); `span` sets its period.
- **Mini month** (`mini`): a small month like a date picker, at most 360 pixels wide, with a dot per event on each day (in its
  tone). Selecting a day reports it like any day selection ([Linked views](#linked-views)), so a page can filter a grid or move
  another calendar to it: listen for `canopyx:linkchange` and call `setCalendarDate` on the other calendar.
- **Week list and day list** (`weekList`, `dayList`): each day's events as a list, all-day events first, without a time axis.
- **Stacked months** (`months`): `months` months one under another in a scrolling column; each day appears once.
- **Year with events**: with `yearEvents`, each month of the year lists its events under its days.

The bar above the calendar has Today, previous and next, the range in words (a month and year, a range of days, a long date),
a date field to jump to, the view buttons (a list on phones) and, in the timeline, the zoom. Changing the view keeps the
focused day; stepping keeps the focused day's place in the period.

Long titles wrap or are cut on screen; the full text is always in the event's accessible name.

## Time zones

Times show in the display zone: the grid's `timeZone` (`utc` or the reader's own, switchable with `setTimeZone`), or the
calendar's own `timeZone`, which can be any IANA zone the browser knows (`Europe/Warsaw`). Days are wall-clock days of that
zone, so a day that a DST change makes 23 or 25 hours long is still one day: week and day views place events by their wall-clock
minutes, so on the night DST starts no event falls in the skipped hour, and on the night it ends events of the repeated hour
share its slots.
Instants on the wire are always ISO 8601 with an explicit zone. Month and weekday names, the order of day and month and the
hour cycle come from `Intl` in the page language, so no English name shows in another language.

## Events

An event button holds the title, the time and, in week, day and agenda views, the subtitle and the status presenter. Its
accessible name says the title, the time or date range, the status, the subtitle, the resource and whether it repeats.
Event text is always the record's text, never markup. A host that needs its own content passes a template:

```js
CanopyX.createDataGrid(host, { view, calendar: { render({ event, row, element, kind }) {
  element.textContent = event.title;            // write text with textContent; any markup is the host's own
  return true;                                  // true: the template owns the content
} } });
```

`kind` is `bar`, `chip`, `block`, `item` or `lane`. The template runs for every drawn event, including the read-only events
of iCalendar sources (`event.external` is true, and their `row` holds the file's values in `fields`, untrusted text like any
record's); the accessible name stays the
calendar's. Under a strict Content Security Policy and Trusted Types the calendar writes no HTML and needs no inline script;
it sets positions through the CSSOM, as the grid does ([security.md](security.md)).

## Keyboard and screen readers

Each view is one ARIA grid with a single tab stop and roving focus.

| View | Keys |
| --- | --- |
| Month | Arrows move by day and week; Page Up and Page Down by month (Shift: by year); Home and End to the week's ends (Ctrl: the month's); Enter goes into the day's events, where Up and Down move, Enter opens and Escape returns; Space selects the day. |
| Week, day, N days | Up and Down by slot (Up from the first slot reaches the all-day row), Left and Right by column (past the edge to the next period), Home and End to the first and last slot, Page Up and Page Down by period, Shift with Up or Down extends a selection of slots, Space selects, Enter goes to the slot's first event. |
| Agenda | Up and Down by event, Home and End, Page Up and Page Down by month, Enter opens. |
| Year | Arrows by day and week across months, Home and End to the month's ends, Page Up and Page Down by year, Enter opens the day. |
| Mini month, week list, day list, stacked months | As the month: arrows by day and week, Page Up and Page Down by period, Enter goes into the day's events. |
| Any view | Shift+F10 or the context-menu key opens the [context menu](#context-menus-and-hover-cards) of the focused event, slot or day; with creating on, N (or Enter on an empty slot or day) proposes a new event there; with drops on, Enter drops a grid row picked up with F2. |

Right to left (`dir="rtl"` on the page or the host, or `CanopyHtmlOptions.Direction`), Left moves forward in time and Right
back, the layout mirrors through logical CSS sides, the timeline runs from the right, and the previous and next arrows point
the reading way (`calendar-rtl.html`).

Escape closes "+N more" and the record drawer. A polite live region announces the view and range after each change, selections,
highlights from other views, moves and refusals. Day cells, slots and lanes have accessible names with their date, time,
resource and number of events.

## The record panel

Clicking an event, or Enter on it, opens its record in the grid's record drawer, with the view's
[record panel](record-panel.md) (sections, tabs, related records, timelines), record deep links (`#record=<view>:<id>`, which
open the drawer beside the calendar) and remote details through `gridRecordQuery`. `canopyx:rowActivate` comes first with
`{ id, row, keyboard, occurrence }`; cancel it to open your own view, or pass `onDetails`. `openCalendarEvent(id)` opens an
event from code. Escape closes the drawer and puts focus back on the event.

## Linked views

The calendar follows the [linked views](linked-views.md) contract of grids:

- **It accepts external filters and highlights.** `setExternalFilter(source, { field, values | range })` filters the records
  (date ranges included) with the same chips and announcements as a grid; `setHighlight(keys)` marks the events of those
  records (a dashed info outline) and announces how many show.
- **It reports selections** with `linkEvents`: selecting a day (click, Space or Enter on an empty day), a range of slots (Shift
  with arrows) or a resource in the timeline dispatches `canopyx:linkchange` with `action: "select"`, `keys` (the records in
  the selection), `values` (the resource, when one was selected), `label` and `range: { column, from, to }`, the instants on
  the start column, `to` exclusive. `clearCalendarSelection()` reports `clear`.

`calendar-linked.html` pairs a calendar with a grid of the same records both ways.

## Facets and saved views

A facet panel ([facets.md](facets.md)) beside or above the calendar filters its events, as it filters a grid. Saved views and
the remembered state keep the calendar's view, date, zoom and collapsed resources (`calendar` in the grid state) with the
query and filters; `resetView()` returns to the definition's view and today.

## Live data

`applyTransaction`, `addRows`, `updateRows`, `removeRows`, `setRows`, `refreshRows` and polling ([live-data.md](live-data.md))
update the calendar in place: it keeps the view, the date, the scroll position, the focused day or event and an open drawer.

## Server data

An inline grid's calendar reads its own rows. A hosted grid's source receives the visible range: a source with
`range(request, { signal })` gets a `gridRangeQuery` (the accepted query with search, filters and external filters, `from` and
`to` in UTC, the columns that hold starts, ends, recurrences, series ends and resources, the visible resources of the timeline,
and the view) and answers a `gridRangePage` of the overlapping records; any other source gets ordinary `gridQuery` pages whose
filter group asks for records that overlap the range. Answers are cached per range and query; a new query or revision starts
afresh, and navigating loads the new range. `CanopyX.AspNetCore` answers range queries at `POST {pattern}/range` over
`IQueryable`, with the same allow-list, scoping, authorization and limits as reads ([remote-dotnet.md](remote-dotnet.md#range-queries)).

When `series` and `recurrenceId` are mapped, selected recurring masters also read their replacement metadata through the
source's ordinary `query` method. These reads name only selected masters and the original occurrence window, including a
master's duration. They use the same dataset revision and source authorization, but omit user search and filters: a
replacement must still suppress its original occurrence after it moves to another date, resource or status. Support records
are never added to the displayed rows or export input. Inline calendars obtain the same metadata from their owning rows.
The metadata reads share a budget of ten pages and `limit` records. If that budget cannot certify a batch of masters, those
masters are withheld and the calendar shows its truncation notice; ordinary events and certified masters remain visible.
Ordinary query fallback supports both offset and cursor sources. The hosted source must allow filtering on `series` and
`recurrenceId`; unsupported predicates or a changed revision fail the load.

## Editing

A calendar is read-only unless `editable` is set (`true`, or `{ move, resize, resources, overlap, workingHours,
allowedResources, snapMinutes, commit }`) and its start and end columns are editable grid columns.

- **Pointer:** drag an event to move it; drag the bottom edge of a time block (or the end of a bar) to change its end, the top
  edge to change its start; drag across resource columns or timeline rows to change its resource. Moves snap to `snapMinutes`
  (default `slotMinutes`), or whole days in the month and all-day rows.
- **Keyboard:** F2 on a focused event starts moving it. Arrows move it (by snap, or by day), Shift with arrows changes its end,
  Alt with Up or Down changes its resource, Enter saves and Escape cancels; each step is announced.
- **Rules:** with `overlap: false` an event may not overlap another on its resource; `allowedResources` names a text column of
  the resource ids each record may move to; `workingHours: true` keeps events inside working hours (or the resource's business
  hours) and out of unavailable time. A proposal that breaks a rule shows its reason on the ghost before the drop, in the danger
  tone, and the drop is refused.
- **The editing contract:** an accepted drop sets the start, end and resource through `setCellValue` as one undo step, with
  validation and dirty tracking ([editing.md](editing.md)). With `commit: "auto"` (the default) the calendar commits it
  through `commitChanges`: `gridCommit` reaches the host's writer (the remote commit writer of CanopyX.Data checks the record's
  original values and revision for conflicts) and `gridCommitResult` answers; a refused or failed save puts the event back and
  says why. With `commit: "manual"` the edit bar saves or discards. Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) undo and redo.
- **Recurring events:** see [Changing one occurrence](#changing-one-occurrence). With `occurrence: "all"` (the default without
  `series` and `recurrenceId` columns) moving or resizing an occurrence of a series moves or resizes the whole series by the same amount.
  `canopyx:occurrenceChange` (and `onOccurrenceChange`) comes first with `{ id, occurrence, start, end, resource }`; cancel it
  to keep the series and handle the one occurrence yourself. A whole series moves only within its day (its time in the series zone changes; excluded instants
  move with it), and not at all while overriding records point at it or, without an editable `exceptions` column, while it has
  excluded instants: those would no longer match their occurrences. The refusal says "Only the time of a whole series can be
  moved here." An inline calendar checks every record for overrides, whatever the search and filters; a hosted calendar with a
  `series` column sees only the records it loaded, so it leaves such a series to the host: handle `canopyx:occurrenceChange`
  (and cancel it) to move it on the server.

## Creating events

With `create` (`true`, or `{ minutes, allDay }`; the `scheduler` preset turns it on) readers add events:

- **Pointer:** click an empty slot (an event of `minutes`, default 60) or an empty day (an all-day event, when the calendar has
  an all-day column and `allDay` is not false; otherwise a timed event at the start of working hours or 09:00), or drag over
  slots in one column, or over days, for a range.
- **Keyboard:** N on any slot or day, or Enter on an empty one. **Context menu:** "New event here".
- `canopyx:eventCreate` (and `onCreate`) comes first with `{ start, end, allDay, resource }`; cancel it (or return false) to
  open your own form. Otherwise a small form asks for the title; Add (or Enter) inserts the record, Cancel or Escape drops it.
- The new record goes through the editing contract: `insertRow` adds it to the change set with a `new-<n>` id, validation and
  undo apply, and with `commit: "auto"` it reaches the writer as a `gridCommit` row `{ "op": "insert", "id": "new-1",
  "values": { ... } }`. A writer answers `saved` with an optional `newId`, the identity it stored the record under, which the
  event then takes ([data-protocol.md](data-protocol.md#editing-and-commit)). A saved new record leaves the undo history: there
  are no deletes in the protocol. CanopyX.Data hands inserts only to writers that accept them.
- The valid range and unavailable time refuse a proposal before the form opens, with the reason in the notice.
- A new record carries the values of the grid's editable columns only (the writer refuses others): an overriding record or a
  dropped row keeps a description, tone or status only where that column is editable. A new record that fails its checks
  stays unsaved, and the notice says why.

The start and title columns must be editable grid columns (`createCalendar` makes its own columns editable when it creates).

## Dropping events

With `drop: true` the calendar accepts:

- **Rows of a CanopyX grid** whose view sets `dragRows` (`CanopyDataGridView.DragRows`): drag a row onto a slot or day, or,
  from the keyboard, press F2 on the row (the grid announces it is picked up), move to a slot or day of the calendar and press
  Enter. The event takes the row's header text as its title and, when the row has a whole number in a `minutes` column, that
  length; the row's values for columns the calendar's grid also has are copied, except the calendar's time and title columns.
- **Page elements** made draggable with a `data-canopyx-event` attribute holding JSON text: `{ "title": "Coffee chat",
  "minutes": 30, "allDay": false, "cells": { ... } }`. The text is read as data, never as markup; values must be text, numbers,
  booleans or null.

While an item hovers, a ghost shows where it would land and turns red with the reason when it cannot. The drop raises
`canopyx:eventReceive` (and `onReceive`) with `{ item, start, end, allDay, resource }`; cancel it to schedule the item yourself.
Otherwise it becomes a new record as above. `calendar-scheduler.html` drops tasks from a grid.

## Changing one occurrence

When the calendar has `series` and `recurrenceId` columns that are editable (the records it writes carry the series link),
moving or resizing an occurrence of a series asks what to change,
in a small dialog (This event, This and following events, All events, Cancel; arrows move between them, Escape cancels).
`occurrence` presets the answer (`this`, `following` or `all`; `ask` is the default with those columns, `all` without; any
setting but `all` needs them), and a
host's `calendar.occurrence(change)` hook may decide first (return a mode, false to cancel, or nothing to keep the setting).

The event menu's **This event** command opens a title/start/end form for that recurring occurrence. The original date and
repeat indicator identify its scope. Save uses the host writer; Cancel or Escape leaves the series unchanged.
`editCalendarOccurrence(occurrenceId)` opens the same form programmatically and returns false for a read-only event.

The editor names the chosen date and explains that other occurrences stay unchanged. Date/time fields show minute
precision; an untouched endpoint keeps its original instant. **Remove this occurrence** adds an EXDATE through the
ordinary validated editing/undo/writer path, and is unavailable when the exception field cannot be edited. Phones use a
bottom sheet. Shared assignments are named in the editor, marked on event cards, and highlighted together on hover or focus.

Large day/week schedules put previous/next controls and a range picker beside their resource headers. The picker jumps
between bounded column windows; keyboard traversal can still reveal each offscreen column. Phone day headings retain
short weekday names, and resource ranges name the first/last index and total. `CalendarResources` customizes the noun
(for example, "Rooms"); the occurrence and range labels are also available through `CanopyLabels`.
Basic calendars built from events automatically provide editable `series`, `recurrenceId` and `exceptions` columns when editing
is enabled. For existing grids, map these columns explicitly. A writable exceptions column adds the original start to EXDATE
in the same undo group and commit batch as the override. If a writer only saves part of that batch, the failed override
stays pending with a save-failure notice so it can be retried. A host without writable exceptions can still suppress through the
override link. The occurrence form always edits this instance; the drag/move flow retains its host occurrence-choice hook.

- **This event** inserts an overriding record: the series' values with the new times, `series` set to the series id and
  `recurrenceId` to the occurrence's original start. The series skips that occurrence.
- **This and following events** ends the series before the occurrence and starts a new series there: the old record's rule
  gets `UNTIL` just before the occurrence (or a smaller `COUNT` when the rule counts), and a new record is inserted from the
  occurrence with the rest of the rule (the remaining `COUNT`) and the exceptions from the occurrence on (timed ones moved
  with it). Both changes are one undo step until they are saved; with `commit: "auto"` the old series is saved first and the
  new one only once that is stored, so a failure never leaves both series whole. A series with overriding records is not
  split (they would still name the old series). On the first occurrence it is the same as All events.
- **All events** moves the whole series, as described under [Editing](#editing).

Every way goes through the editing contract: updates, inserts, the writer and the conflict checks. This and following keeps
the occurrence on its day (another day would leave the rule's weekdays and the exceptions behind); if the new series cannot
be saved after the old one was cut, it stays unsaved with the reason, so it is not lost.

When a commit writer saves a copied occurrence or a split series, the copied non-null values must belong to editable
columns. The built-in operation refuses a copy it cannot preserve, before inserting a row or cutting the old series.
Read-only values stay outside the writer's allow-list. A host that needs to preserve those values can handle the cancelable
`canopyx:occurrenceChange` event or the `calendar.occurrence` hook, perform its own authorized writes, and cancel the built-in
operation. A local inline calendar without a commit writer keeps the copied values in its client-side records.

## Sources and iCalendar

`sources` lists up to 50 event sources: `{ id, label, tone?, color?, ics?, url?, fetchParams?, hidden? }`. A legend under the bar shows one switch per
source in its tone; switching one off hides its events in every view at once (`setCalendarSource(id, visible)` does the same
from code, and `canopyx:calendarSource` reports it). Records name their source in the `source` column; a source's tone colours
records without a tone or status tone of their own. `hidden` starts a source switched off.

A source with `ics` names an iCalendar file on the page's own site (a relative address, or an absolute one on the same origin;
another site is refused when the definition is read). Its events join every view read-only: they open their details (title,
time, location, description, the source's name) and cannot be moved. The file is fetched once, with the page's credentials,
and read as untrusted text within the limits of [icalendar.md](icalendar.md): at most 8 MB, 2,000,000 characters, 5,000
events, 75,000 lines, 10,000 characters a line, 1,000 characters of summary, location and categories, 10,000 of description and
1,000 exceptions an event. A file past a limit, without a calendar, or that cannot be fetched fails with a notice ("Could not
read Holidays: ..."), and `canopyx:calendarImport` reports each source's event count, skipped events and notes. The .NET
`CanopyICalendar.Parse` reads the same subset within the same limits ([icalendar.md](icalendar.md)).

A source with `url` reads a same-origin JSON array for each visible period. It sends `start` (inclusive), `end` (exclusive)
and `timeZone`, plus the string query parameters in `fetchParams`; those three names are reserved. `url` and `ics` are
mutually exclusive. Each JSON event has `id` (optional), `title`, `start`, optional `end`, `allDay`, `description`, `resource`,
`resourceIds`, `recurrence`, `exceptions`, `series` and `recurrenceId`, using the basic event shape. Instants need an offset;
`yyyy-MM-dd` denotes a date. A feed has at most 5,000 events, 8 MB and 2 million characters. A reload fetches at most four
sources concurrently and accepts at most 16 MB across all feeds and the calendar's `limit` events, including cached answers.
Reaching a combined limit reports an error and stops loading further sources; already accepted sources remain usable.
Feed events are read-only and have
source-scoped identities: `series` names the master's original id in that same feed. Treat the occurrence `id` returned by
`getCalendarEvents()` as opaque and use it when opening or editing an occurrence. The `record` field retains the host record
key; external records also carry `source` and `external`, so a matching host key does not identify the same event.
External events do not contribute host row keys to linked selections or receive host row highlights.
Failed sources show a notice while other sources remain usable. A newer range or destruction aborts
the obsolete request. Hidden JSON sources make no request until shown; the last twelve source/range results are cached.
`color: "#2563eb"` supplies a source colour for events and its legend switch; absent it, the existing tone rules apply.

```javascript
sources: [{ id: "team", label: "Team", url: "/calendar/team.json",
  fetchParams: { location: "studio" }, color: "#2563eb", hidden: false }]
```

The .NET equivalent is `CanopyCalendarSource.Url`, `.FetchParams`, `.Color` and `.Hidden`. A calendar whose sources all have
`url` or `ics` needs no source column. Serve generated examples over HTTP to use feeds; files opened from disk cannot fetch
HTTP sources. The generated `calendar-resource-window.html` schedule includes a hidden optional JSON feed.

## Context menus and hover cards

`menu` (on by default) gives events, slots, days and timeline cells a menu: right-click, a long press on touch screens,
Shift+F10 or the context-menu key. An event offers Open and, when it can be moved, Move (the keyboard move mode); a slot, day
or timeline cell offers New event here when creating is on. A host's `calendar.menu(context, defaults)` hook gets `{ kind,
event, day, minutes, resource }` and the default items, and returns the items to show (`{ id }` keeps a default, `{ label, run,
disabled }` adds its own), `null` for no menu (the browser's own stays), or nothing to keep the defaults. An event in the
context carries `source` and `external` (an iCalendar event, whose `record` is not a record of the grid). Arrows, Home, End,
Enter and Escape work in the menu; choosing an item or Escape returns focus to where it opened, and an item that moves focus
(Move, a host's dialog) takes it from there.

`hover` (on by default) shows a card with an event's details after a short delay under a pointer; it hides when the pointer
leaves, a key is pressed or a drag starts, and never shows on touch, where the details popover and the menu serve instead.

## Recurrence

`recurrence` names a text column holding an RRULE ([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10)) in
this subset: `FREQ` `DAILY`, `WEEKLY`, `MONTHLY` or `YEARLY`, with `INTERVAL`, `COUNT` or `UNTIL`, `BYDAY` (ordinals such as
`2TU` or `-1FR` in monthly and yearly rules), `BYMONTHDAY` (negative counts from the month's end), `BYMONTH`, `BYSETPOS` and
`WKST`. Any other part is an error, reported once through the grid's `error` event, and the record shows once.

- The event's own start counts as the first occurrence, and every occurrence keeps its wall-clock time in the series zone: the
  calendar's IANA `timeZone`, otherwise UTC (all-day series always expand in UTC). A series therefore lands on the same instants
  for every reader, whatever their browser's zone or `setTimeZone`, and a 09:00 window in `Europe/Warsaw` stays at 09:00 there
  across DST. Give a calendar with local series its IANA `timeZone`; `CanopyRecurrence.Occurrences` takes the same zone. A wall time a DST change skips uses the offset before the gap
  (02:30 becomes 03:30); a repeated unspecified wall time means its first occurrence. An explicit instant, including a
  `DateTimeOffset` or a UTC/local `DateTime` passed to `CanopyRecurrence`, keeps its exact first occurrence even in the second
  repeated hour; later occurrences keep its wall-clock time. `UNTIL` as a date includes that whole day.
- `exceptions` names a text column of EXDATE values, separated by commas, semicolons or white space, at most 1,000: instants
  with `Z` or an offset remove the occurrence starting then, wall times without an offset (`yyyy-MM-ddTHH:mm`, optionally with
  seconds and a fraction) are read in the series zone, and `yyyy-MM-dd` dates remove every occurrence on that day. An invalid
  value is an error, as for rules.
- `series` and `recurrenceId` name the columns of an overriding record: the series it belongs to and the original start of the
  occurrence it replaces. The series skips that occurrence and the overriding record shows as an ordinary event.
- `seriesEnd` names the column with the end of a series' last occurrence (null for endless), which a server reads to find the
  series a range touches. `CanopyRecurrence.SeriesEnd(...)` computes it.
- Only the visible range is expanded; a long series is walked, never stored.

`CanopyRecurrence` builds and reads the same rules in C# (`CanopyRecurrence.Weekly(DayOfWeek.Tuesday).Every(2).Times(10)`),
writes them in a canonical order (`ToString()`), parses them (`Parse`, `TryParse`) and expands them over a range in a
`TimeZoneInfo` (`Occurrences`). The browser and C# implementations are checked against the same cases
(`tests/fixtures/recurrence-cases.json`), which include the RFC 5545 examples the subset covers and DST transitions.

## Export and print

- **iCalendar:** the Export menu offers "iCalendar (.ics)" for its scopes, and `exportCalendar({ scope })` exports the records
  of the visible occurrences (`visible`, the default) or of the grid's `filtered`, `selected` and `all` scopes, resolving with
  `{ blob, fileName, text }` (`download: true` saves the file). Each record is one `VEVENT`: a series keeps its `RRULE` and
  `EXDATE`, written in its zone's wall time with a `VTIMEZONE`; an overriding record carries `RECURRENCE-ID`; all-day events are
  dates. Text is escaped and lines are folded at 75 octets. Multiple `resourceIds` assignments have no iCalendar `LOCATION`
  mapping; export uses the single `resource` or an imported location when present.
- **CSV and Excel:** the grid's Export menu and `toCsv`, `copy`, `exportAs` and `exportToHost` export the records of the query,
  so the calendar's filters, facets and external filters apply.
- **Print:** the month prints every event (rows grow instead of folding into "+N more"), week and day views print every hour,
  the agenda prints as a list, and the timeline prints a static copy (see [resource-timeline.md](resource-timeline.md#print)).
  The toolbar and the navigation bar are left out.

## Themes, density and phones

The calendar uses the grid's tokens, so it follows the light, dark and `auto` themes and a host's palette; forced colours draw
events, today, selections and the now line with system colours. Event tones are the grid's tones. At 640 pixels and less the view
buttons become a list, the month shows short weeks of dots with the selected day's list under it (today until another day is
tapped), the N-day view shows three days, day and week views with resource columns show two resources (one a day in longer
views) with a picker for the others, and phones start in the agenda.

The go-to-date control shows the date in the calendar's language and opens the browser's date picker kept behind it; where a
browser cannot open the picker from a script, the native date input shows instead. The year view has a legend for its shading,
and each day's tooltip and accessible name give its number of events. The now line runs beneath events and capacity counts.

## API

| Member | Meaning |
| --- | --- |
| `getCalendar()` | `{ view, date, zoom, from, to, timeZone, events, collapsed }`. |
| `setCalendarView(view)`, `setCalendarDate("yyyy-MM-dd")`, `setCalendarZoom(zoom)` | Change the view, the date or the timeline zoom. |
| `calendarStep(1 \| -1)`, `calendarToday()` | Step a period, or go to today. |
| `getCalendarEvents()` | The occurrences shown: `{ id, record, start, end, allDay, title, resource, recurring, background }`. |
| `openCalendarEvent(id)` | Opens an event's record. |
| `exportCalendar(options)` | iCalendar text, see above. |
| `clearCalendarSelection()` | Clears a selected day, range or resource. |
| `canopyx:calendar` / `onCalendar` | After each paint of a view or range, with `getCalendar()`'s state. |
| `canopyx:occurrenceChange` / `onOccurrenceChange` | Before an occurrence of a series moves; cancelable. |
| `setCalendarSource(id, visible?)` | Shows or hides a source's events; omitted switches it. `canopyx:calendarSource` reports `{ id, visible }`. |
| `canopyx:eventCreate` / `onCreate` | Before a proposed new event opens the form; cancelable. |
| `canopyx:eventReceive` / `onReceive` | Before a dropped item becomes a record; cancelable. |
| `canopyx:calendarImport` | After an iCalendar source was read: `{ source, events, skipped, notes }`. |
| `insertRow({ id?, cells })` | The editing API's insert, which creating and dropping use ([editing.md](editing.md)). |
| `CanopyX.createCalendar(host, options)` | A calendar from a list of events ([Quick start](#quick-start)). |

The calendar methods load the calendar part first. TypeScript types are in `calendar.d.ts` (`GridCalendarDefinition`,
`GridCalendarApi`, `GridRangeQuery`, `CalendarOptions`, `CalendarEventInput`, …), re-exported from `@evotecit/canopyx/grid`.

## Parts and sizes

The calendar core ships in the `calendar` part (`canopyx-calendar.js` and `.css`): every view, the bar, the popover, menus,
hover cards and sources. What a basic calendar does not use is in parts of its own, loaded before the calendar starts when the
definition uses them, or on first use: `calendar-recurrence` (rules and exceptions, recurring ranges, iCalendar sources),
`calendar-edit` (moving, resizing, creating, dropping and occurrence changes), `calendar-ics` (iCalendar export, from the Export
menu or `exportCalendar`, and import) and `timeline` (the timeline, resources and resource columns). A grid whose view declares
a calendar loads its parts before its first query, so the first paint is the calendar; the grid entry points keep only the
stubs. Single-file pages carry the parts' payloads for views that need them: a calendar whose toolbar shows Export carries
`calendar-ics`, so a page from disk can still export ([plugins.md](plugins.md)).

| Asset | gzip baseline | Guard |
| --- | --- | --- |
| `canopyx-calendar.js` | 34,796 bytes | 40,000 |
| `canopyx-calendar.css` | 5,522 bytes | 6,400 |
| `canopyx-calendar-recurrence.js` | 3,304 bytes | 3,800 |
| `canopyx-calendar-edit.js` | 12,196 bytes | 14,050 |
| `canopyx-calendar-ics.js` | 8,209 bytes | 9,450 |
| `canopyx-timeline.js` | 10,883 bytes | 11,450 |
| `canopyx-timeline.css` | 2,046 bytes | 2,256 |

The guards in `GridCalendarPartTests` bound compressed asset growth. The editing and iCalendar budgets use the current
measured sizes plus about 15%; the other parts retain their existing budgets. A basic calendar page (`calendar-basic.html`) carries
the core part only (and `calendar-recurrence` when an event repeats); a scheduler page carries the editing, iCalendar and
recurrence parts too.
## Performance

`tests/browser/specs/calendar-performance.spec.mjs` records opt-in Chromium measurements. Paint timing runs in the page from
the mount call to the frame after the first event is painted, as the median of three cold loads. The reference targets are:

- A month of 5,000 events paints within 150 ms (about 100 ms on a workstation).
- A timeline of 5,000 resources and 100,000 events whose source answers range queries shows its first rows within 300 ms (about
  140 ms): the first request already names only the resources in view. The same events inline take about 350 ms, most of it
  the grid's own validation of 100,000 rows; that case has a 750 ms budget.
- Scrolling that timeline down through the resources and across the month, including the range loads that follow, has no long
  task (over 50 ms).
- Dragging an event among 1,000 visible events keeps 55 frames a second or more, with no long task.
- The bounded adversarial iCalendar import completes in less than 3,000 ms.

Run these measurements separately from ordinary correctness CI:

```sh
cd tests/browser
node tools/browsers.mjs chromium --benchmarks --project=calendar-performance --no-deps
```

The original samples, workloads and limits remain in that lane. Runner load affects the measurements, so they do not gate
normal PR merges. Correctness tests retain range loading, bounded virtual lanes, pointer cancellation and parser limits.

Only the visible lanes, units and events are in the DOM, whatever the number of resources; a month folds busy days into
"+N more"; each range reads only its occurrences, and a long series is walked, never stored.
