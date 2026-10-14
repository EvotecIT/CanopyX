---
title: Choose how to deliver a view
order: 2
description: Compare single HTML files, sidecar bundles and hosted data sources, and learn how CanopyX handles large datasets and exports.
layout: docs
---

The same view definition can reach readers in three ways.

| Delivery | What you ship | Good for |
| --- | --- | --- |
| Single HTML file | One page with the runtime and data inline | Reports you attach, archive or open from disk |
| Sidecar bundle | A page plus data and search files next to it | Very large trees opened from a file share, with no server |
| Hosted data | Your application serves pages, search results and counts | Live data, paged or cursor-based records |

Tree grids support all three. Data grids support a single HTML file or hosted data.

## Working with larger datasets

Virtual rows keep the rendered page small. Tree bundles split data into sidecar files, and hosted sources let your application fetch records as the reader navigates. Flat-grid queries filter and sort the complete dataset before paging; loading one page does not mean the rest of the results are available in the browser.

The [file explorer demo](/demos/) is a bundle of more than 100,000 nodes served as static files.

## Exports

CSV export and copying distinguish filtered results, selected records and all records. For Office files, large exports or application actions, connect your own callbacks to the view.

## Protocol reference

Hosted sources answer with versioned `canopyx/2` documents. The [data protocol](https://github.com/EvotecIT/CanopyX/blob/main/docs/data-protocol.md) describes views, pages, search results, counts and URL templates.