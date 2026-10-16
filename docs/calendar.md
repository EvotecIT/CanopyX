# Calendar

A flat grid can show its records as a calendar: month, week, day, a run of N days, an agenda and a year overview, and, with
resources, a [resource timeline](resource-timeline.md). The calendar is a presentation of the grid, not a separate widget. The
grid's toolbar (search, filters, columns, saved views, export), its query line and chips, the record panel, facets, linked views,
live data and editing all work on the same records, so a calendar picks up every grid feature a page already uses. It is
another view to choose; nothing else changes.

The `calendar.html` example is an operations calendar written from typed records. `calendar-timeline.html`,
`calendar-resources.html`, `calendar-certificates.html`, `calendar-passwords.html` and `calendar-linked.html` show the
resource timeline, resource columns, a facet panel with thousands of certificate expiries, an all-day agenda and a calendar
linked with a grid. `calendar-pl.html` and `calendar-de.html` show the Polish and German label packs.

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
| `recurrence`, `exceptions`, `series`, `recurrenceId`, `seriesEnd` | [Recurrence](#recurrence). |
| `display` | Text column; `background` draws the record as a background range instead of an event. |
| `view`, `views` | The first view and the views offered: `month`, `week`, `day`, `days`, `agenda`, `year`, `timeline`. Default `month`, `week`, `day`, `agenda`, plus `timeline` with resources. |
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
| `ranges` | Static background ranges `{ start, end, label, tone?, resource?, kind?, recurrence? }`: holidays, freezes, maintenance windows (`kind` `background`), or time a resource cannot take events (`unavailable`). |
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
  each day. Working hours, unavailable time and background ranges shade the columns; a line marks now. With resources of at
  most 24 leaves, day and week views get [resource columns](resource-timeline.md#resource-columns-in-day-and-week-views).
- **Agenda**: the period's events grouped by day, with their time (or All day), title, subtitle and status. Phones start here.
- **Year**: twelve small months; each day is shaded by its number of events, which its accessible name and tooltip give.
- **Timeline**: resources as rows, time across; see [resource-timeline.md](resource-timeline.md).

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

`kind` is `bar`, `chip`, `block`, `item` or `lane`. The template runs for every drawn event; the accessible name stays the
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
- **Recurring events:** moving or resizing an occurrence of a series moves or resizes the whole series by the same amount.
  `canopyx:occurrenceChange` (and `onOccurrenceChange`) comes first with `{ id, occurrence, start, end, resource }`; cancel it
  to keep the series and handle the one occurrence yourself, typically by adding an overriding record (`series` and
  `recurrenceId`) through live data. A series moves only within its day (its time in the series zone changes; excluded instants
  move with it), and not at all while overriding records point at it or, without an editable `exceptions` column, while it has
  excluded instants: those would no longer match their occurrences. The refusal says "Only the time of a whole series can be
  moved here." An inline calendar checks every record for overrides, whatever the search and filters; a hosted calendar with a
  `series` column sees only the records it loaded, so it leaves such a series to the host: handle `canopyx:occurrenceChange`
  (and cancel it) to move it on the server.

## Recurrence

`recurrence` names a text column holding an RRULE ([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10)) in
this subset: `FREQ` `DAILY`, `WEEKLY`, `MONTHLY` or `YEARLY`, with `INTERVAL`, `COUNT` or `UNTIL`, `BYDAY` (ordinals such as
`2TU` or `-1FR` in monthly and yearly rules), `BYMONTHDAY` (negative counts from the month's end), `BYMONTH`, `BYSETPOS` and
`WKST`. Any other part is an error, reported once through the grid's `error` event, and the record shows once.

- The event's own start counts as the first occurrence, and every occurrence keeps its wall-clock time in the series zone: the
  calendar's IANA `timeZone`, otherwise UTC (all-day series always expand in UTC). A series therefore lands on the same instants
  for every reader, whatever their browser's zone or `setTimeZone`, and a 09:00 window in `Europe/Warsaw` stays at 09:00 there
  across DST. Give a calendar with local series its IANA `timeZone`; `CanopyRecurrence.Occurrences` takes the same zone. A wall time a DST change skips uses the offset before the gap
  (02:30 becomes 03:30); a repeated one means its first occurrence. `UNTIL` as a date includes that whole day.
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
  dates. Text is escaped and lines are folded at 75 octets.
- **CSV and Excel:** the grid's Export menu and `toCsv`, `copy`, `exportAs` and `exportToHost` export the records of the query,
  so the calendar's filters, facets and external filters apply.
- **Print:** the month prints every event (rows grow instead of folding into "+N more"), week and day views print every hour,
  the agenda prints as a list, and the timeline prints a static copy (see [resource-timeline.md](resource-timeline.md#print)).
  The toolbar and the navigation bar are left out.

## Themes, density and phones

The calendar uses the grid's tokens, so it follows the light, dark and `auto` themes and a host's palette; forced colours draw
events, today, selections and the now line with system colours. Event tones are the grid's tones. At 640 pixels and less the view
buttons become a list, the month shows dots with the focused day's list under it, the N-day view shows three days and phones
start in the agenda.

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

The calendar methods load the calendar part first. TypeScript types are in `calendar.d.ts` (`GridCalendarDefinition`,
`GridCalendarApi`, `GridRangeQuery`, …), re-exported from `@evotecit/canopyx/grid`.

## Parts and sizes

The calendar ships in the `calendar` part (`canopyx-calendar.js` and `.css`), and the resource timeline in the `timeline` part
(`canopyx-timeline.js` and `.css`), which a calendar with resources loads. A grid whose view declares a calendar loads the part
before its first query, so the first paint is the calendar; the grid entry points keep only the stubs. Single-file pages carry
the parts' payloads (and the tree tools of a resource tree) for views that need them ([plugins.md](plugins.md)).

| Asset | gzip | Guard |
| --- | --- | --- |
| `canopyx-calendar.js` | 35,124 bytes | 40,400 |
| `canopyx-calendar.css` | 3,917 bytes | 4,500 |
| `canopyx-timeline.js` | 9,960 bytes | 11,450 |
| `canopyx-timeline.css` | 1,962 bytes | 2,256 |

The grid entry points grow by about 420 bytes gzip (the part stubs, the calendar label names and the state key). The guards,
in `GridCalendarPartTests`, are the measured sizes plus 15%.

## Performance

`tests/browser/specs/calendar-performance.spec.mjs` holds the calendar to these gates on Chromium, timed in the page from the
mount call to the frame after the first event is painted, as the median of three cold loads:

- A month of 5,000 events paints within 150 ms (about 100 ms on a workstation).
- A timeline of 5,000 resources and 100,000 events whose source answers range queries shows its first rows within 300 ms (about
  140 ms): the first request already names only the resources in view. The same events inline take about 350 ms, most of it
  the grid's own validation of 100,000 rows; that case has a 750 ms budget.
- Scrolling that timeline down through the resources and across the month, including the range loads that follow, has no long
  task (over 50 ms).
- Dragging an event among 1,000 visible events keeps 55 frames a second or more, with no long task.

Only the visible lanes, units and events are in the DOM, whatever the number of resources; a month folds busy days into
"+N more"; each range reads only its occurrences, and a long series is walked, never stored.
