---
title: Build a reporting grid
order: 3
description: Group records, filter from the column headers, count values with facets, add aggregates and cell presenters, and export what the reader selected.
layout: docs
meta.wide: true
---

A reporting grid is a `CanopyDataGridView` with a `Reporting` definition. Pages written from C# pick the reporting runtime by themselves; JavaScript hosts import `@evotecit/canopyx/reporting` and its `reporting.css`.

## Group, filter and summarise

`records` below is your own data. Everything else is the view: grouping by site, filters in the column headers, a facet with value counts, a status bar, selection checkboxes and an average over the patch column.

{{< cnx-example id="reporting" caption="The devices page, running here. Open a column filter, pick a site from its value list, select a few rows and read the selected count and average in the status bar." >}}

- **Grouping** leads the order with the grouping column. Group headings show full group counts, and collapsing a group hides its rows without removing them from selections or exports.
- **Header filters** open from a column's menu. Text columns offer a value list with counts over the complete query; number and date columns offer ranges.
- **Facets** declared with `FacetColumns` supply those value counts. A hosted source answers them itself.
- **Aggregates** compute over the complete filtered query, not the rows on screen.

## Present cells

Presenters change how a cell looks, never its value: sorting, search and export still use the raw value. `Progress` draws a bar for a numeric column, `Boolean` a check mark, and `Identifier` a monospaced name with optional secondary text. Others include `State`, `StatusStrip`, `SparklineBars`, `SparklineLine`, `Link`, `List` and `LongText`.

A cell's `Tone` names a state (`success`, `warning`, `danger`, `info`, `muted` or one of your own) and the theme maps it to colours; the device grid above marks low patch levels with `danger`.

## Export what the reader chose

The export menu distinguishes filtered results, selected records and all results, and exports use the accepted query and stable record IDs, independently of the rows on screen. CSV and copying run in the browser; larger Office files go through your own `onExport` callback, which receives the same captured rows.

The [device inventory demo](/demos/#inventory) combines all of this over 1,200 records with a 14-day status strip and sign-in sparklines.
