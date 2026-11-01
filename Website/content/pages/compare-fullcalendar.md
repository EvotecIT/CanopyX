---
title: CanopyX vs FullCalendar
description: How the CanopyX calendar compares with FullCalendar, including resources, timelines, licensing and migration.
slug: compare/fullcalendar
meta.seo_title: CanopyX vs FullCalendar: features, licensing and migration
---

[FullCalendar](https://fullcalendar.io/) is the standard JavaScript calendar. CanopyX's calendar is different in one way: it's a view of a grid, so search, filters, saved views and records all come with it. Details below were checked against [FullCalendar pricing](https://fullcalendar.io/pricing) and its [plugin list](https://fullcalendar.io/docs/plugin-index) on 1 November 2026.

| | CanopyX | FullCalendar Standard | FullCalendar Premium |
| --- | --- | --- | --- |
| Licence | MIT | MIT | Commercial, from $480 |
| Month, week, day, list | Yes | Yes | Yes |
| Timeline view | Yes | No | Yes |
| Vertical resource view | Yes | No | Yes |
| Printer-friendly rendering | Yes | No | Yes |
| Recurring events | RFC 5545 RRULE subset | RRULE plugin | RRULE plugin |
| iCalendar | Import and export | Feed plugin | Feed plugin |
| Grid of the same records | Yes | No | No |
| Saved views and facets | Yes | No | No |
| React and Vue components | No | Yes | Yes |
| Script-free email table | Yes | No | No |

## When to choose FullCalendar

- You only need a calendar, and you want the smaller, focused tool.
- Your app is React or Vue and you want an official component.
- You rely on its plugins, or its long record in production.

## When to choose CanopyX

- You need timelines and resources under MIT.
- People need to switch between calendar and table without two data models.
- You write .NET, or want a calendar in a report that opens from disk.

## Moving a calendar across

A list of events carries over almost unchanged:

```javascript
import { createCalendar } from "@evotecit/canopyx/grid";

createCalendar(document.getElementById("calendar"), {
  events: [
    { title: "Sprint planning", start: "2026-10-16T09:00:00Z", end: "2026-10-16T10:30:00Z" },
    { title: "Conference trip", start: "2026-10-20", end: "2026-10-23" }
  ]
});
```

The calendar loads optional parts, so see the [calendar quick start](https://github.com/EvotecIT/CanopyX/blob/main/docs/calendar.md#quick-start) for the imports it needs. Recurrence is a subset of RRULE, so check your rules against the [recurrence notes](https://github.com/EvotecIT/CanopyX/blob/main/docs/calendar.md#recurrence).
