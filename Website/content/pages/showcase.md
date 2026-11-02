---
title: Showcase
description: A complete CanopyX report in one HTML file, with a ChartForgeX chart, a calendar and a grid linked both ways.
slug: showcase
meta.wide: true
meta.seo_title: Showcase: a complete report in one file | CanopyX
---

Two weeks of change records as a report: a [ChartForgeX](https://chartforgex.com/) chart, a calendar and a grid. Click a day in the calendar to filter the records, or select records to mark them in the calendar. The view definitions, the runtime and the data are all in one HTML file, with no server behind it.

<figure class="cnx-frame cnx-showcase">
  <div class="cnx-frame__bar">
    <span class="cnx-frame__title">Change weeks, 2 to 13 November</span>
    <a class="cnx-frame__open" href="/live/showcase/change-week.html" download="change-weeks.html">Download this report</a>
  </div>
  <iframe title="CanopyX report of two change weeks" data-cnx-frame data-src="/live/showcase/change-week.html" data-src-dark="/live/showcase/change-week-dark.html"></iframe>
</figure>

## How it is made

The report is written in C# from a list of records. The chart comes from ChartForgeX as an SVG; CanopyX has no reference to it, and the page places it beside the views. A few lines of script on the page connect the calendar and the grid through their link events.

- [Linked views](https://github.com/EvotecIT/CanopyX/blob/main/docs/linked-views.md)
- [Calendar](/views/calendar/)
- [Delivery modes](/docs/delivery/)
