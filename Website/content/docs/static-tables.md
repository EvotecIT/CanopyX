---
title: Render tables for email and print
order: 4
description: Turn tree and grid views into script-free HTML tables with row limits, a link to the full report, a dark palette or colours that follow the host page.
layout: docs
---

`CanopyStaticHtml` renders a view as a plain HTML table with inline styles and no script. It survives mail clients, print and Word, and it is also the fallback a page can show before its runtime loads. `Render` takes a tree view and `RenderGrid` a data grid.

## Cut an outline to fit a message

A message has room for the top of a tree. `MaxRows` and `MaxDepth` cut the outline, every cut branch shows how many rows it hides, and the overflow note links to the interactive report. `shares` below is the file shares view the [demos](/views/) use.

{{< cnx-example id="static-outline" caption="The returned HTML on white, as a mail client shows it. The note under the table counts the rows left out and links to the full report." >}}

`OnlyExpanded` shows only the branches marked `Expanded`, so the outline matches the tree's first state. Counts in the note and the row markers use `Culture`, and `OverflowNote` or the view's `Labels` translate the note.

## Use the dark palette

`CanopyStaticTheme.Dark()` writes dark literals for a document with a dark background. You can also set the colours your own design tokens resolve to on a `CanopyStaticTheme`.

{{< cnx-example id="static-dark" caption="The same outline with the dark palette written as literal colours." >}}

## Follow the page theme

`UseThemeVariables` writes every colour twice: the literal, then the `--cx-*` custom property the browser runtime uses. On a page that defines those properties the table follows its theme without script; in email and Word the literals apply.

{{< cnx-example id="static-themed" caption="The device grid from Reporting grids, following this site's theme. Switch the theme in the header to see it change." >}}

Presenters become text in static output: a boolean becomes a check mark, a status strip a count of each state, and a sparkline its values. `RenderGridWithResult` also returns the rendered rows and the total, for a print or export pipeline that needs them.
