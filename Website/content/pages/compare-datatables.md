---
title: DataTables alternative without jQuery
description: Looking for a DataTables alternative? How CanopyX enhances an existing HTML table, and when DataTables remains the right choice.
slug: compare/datatables
meta.seo_title: DataTables alternative: CanopyX compared | CanopyX
---

[DataTables](https://datatables.net/) has been upgrading HTML tables for many years, and we used it in our own reports for a long time. If you're looking for an alternative, CanopyX's `enhance` starts from the same place: a table already in your page. Details below were checked against [DataTables Plus](https://datatables.net/plus/) and its [extensions](https://datatables.net/extensions/), with Editor's [server libraries](https://datatables.net/extensions/editor/), on 1 November 2026.

| | CanopyX | DataTables |
| --- | --- | --- |
| Licence | MIT | MIT core, with paid Plus extensions |
| Editing | Included; your code saves the changes | Editor, in Plus from $219 per developer |
| Enhance an existing table | Yes, and the table stays as the no-script fallback | Yes |
| Search, sort, paging | Yes | Yes |
| Export | CSV and copy, optional offline XLSX and PDF | Buttons extension |
| Grouping and totals | Multi-level grouping and aggregates | RowGroup extension |
| Pivot, board, calendar | Yes | Not in the listed extensions |
| Editing server libraries | .NET | PHP, .NET, Node.js and Python |
| Community | New | Large and long-established |

## When DataTables is the right choice

- You already run it and it does what you need.
- Your site is built on jQuery plugins, or you depend on a specific extension or integration.
- You want the large archive of community answers.

## When CanopyX may suit you

- You want one library from a simple table up to grouping, editing and other views.
- Your server is .NET, and you'd like paging, filters and saved edits over `IQueryable`.
- You want virtual scrolling and saved views in the core.

## Trying it on an existing table

Your table stays as it is. The familiar `data-order` and `data-search` cell attributes work, and so does `data-page-length`:

```html
<table id="servers" data-page-length="10" data-order='[[3,"desc"]]'>
  ...
  <td data-order="37">37 %</td>
</table>

<script>
  CanopyX.enhance("#servers");
</script>
```

Records use the same `data`, `columns`, `order` and `pageLength` shape you'd expect. The [enhance guide](https://github.com/EvotecIT/CanopyX/blob/main/docs/enhance.md) covers URLs, server-side mode and state saving. Option names look familiar on purpose, but this isn't a drop-in replacement, so test extensions and callbacks one at a time.
