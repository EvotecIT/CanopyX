---
title: Choose how to deliver a view
order: 5
description: Compare single HTML files, sidecar bundles and hosted data by the files each one writes, and learn how CanopyX handles large datasets and exports.
layout: docs
---

The same view definition can reach readers in three ways. Each tab below shows the call and the files it wrote when this site was built, drawn as a CanopyX tree.

{{< cnx-modes >}}

Tree grids and data grids support all three. A data-grid bundle writes row chunks as sidecar files, so a large grid can open from disk or a file share without a server.

## Working with larger datasets

Virtual rows keep the rendered page small. Tree bundles split branches into sidecar files; data-grid bundles split rows into chunks. Hosted sources let your application fetch records as the reader navigates. Flat-grid queries filter and sort the complete dataset before paging; loading one page does not mean the rest of the results are available in the browser.

The [file explorer demo](/demos/) is a bundle of more than 100,000 nodes served as static files. Sidecar data files are scripts rather than JSON because browsers block `fetch` of local files on `file://`; a script tag loads from a file share, a web server or SharePoint alike.

## Exports

CSV export and copying distinguish filtered results, selected records and all records. For Office files, large exports or application actions, connect your own callbacks to the view.

## Protocol reference

Hosted sources answer with versioned `canopyx/2` documents. [The data protocol](/docs/data-protocol/) shows the documents beside the grids they produce.
