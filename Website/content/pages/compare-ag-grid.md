---
title: CanopyX vs AG Grid
description: Licensing, features and migration from AG Grid to CanopyX, with the cases where AG Grid is the better choice.
slug: compare/ag-grid
meta.seo_title: CanopyX vs AG Grid: features, licensing and migration
---

[AG Grid](https://www.ag-grid.com/) is the benchmark for data grids. The short version: AG Grid has more depth and reach, while CanopyX includes more under MIT and adds report delivery from .NET. Details below were checked against [AG Grid's edition comparison](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/) for version 36.2 on 1 November 2026.

| | CanopyX | AG Grid Community | AG Grid Enterprise |
| --- | --- | --- | --- |
| Licence | MIT | MIT | Commercial, listed from $999 per developer |
| Row grouping and aggregates | Yes | No | Yes |
| Pivot | Yes | No | Yes |
| Cell ranges and Excel-style clipboard | Yes | No | Yes |
| Master/detail | Detail rows and a record panel | No | Yes |
| Server-side data | Your query function, or `CanopyX.Data` for .NET | Infinite row model | Server-side row model |
| Excel export | Optional offline writer | No | Yes, with styles and formulas |
| Row virtualization | Yes | Yes | Yes |
| Column virtualization | Matrix only | Yes | Yes |
| Integrated charts | No, your page draws them | No | Yes |
| React, Angular and Vue components | No | Yes | Yes |
| Single-file reports from C# | Yes | No | No |
| Script-free email table | Yes | No | No |

## When to choose AG Grid

- Your app is React, Angular or Vue and you want official components.
- Your grids have well over 100 columns. CanopyX mounts every visible column in a flat grid, and [our own benchmark](https://github.com/EvotecIT/CanopyX/blob/main/docs/large-data.md) starts to drop frames around there.
- You want charts built into the grid, or Excel export of a pivot. CanopyX can't write pivots to Excel yet.
- You need a commercial support contract, or a long production record.

## When to choose CanopyX

- You want grouping, pivots and cell ranges without a per-developer licence.
- You write .NET and want reports that open from disk, with no Node.js or build step.
- The same records also need to be a [board](/views/board/), [calendar](/views/calendar/) or [tree](/views/files/).

## Moving a grid across

Column definitions map closely. This AG Grid setup:

```javascript
createGrid(element, {
  rowData: projects,
  getRowId: params => params.data.id,
  columnDefs: [
    { field: "name", headerName: "Project" },
    { field: "owner.name", headerName: "Owner" },
    { field: "budget", headerName: "Budget", type: "numericColumn" }
  ]
});
```

becomes:

```javascript
const grid = await CanopyX.grid("#projects", {
  data: projects,
  rowId: "id",
  columns: [
    { data: "name", title: "Project" },
    { data: "owner.name", title: "Owner" },
    { data: "budget", title: "Budget", type: "number" }
  ]
});
```

Custom cell components are the part to plan for. In CanopyX they're either [declarative presenters](https://github.com/EvotecIT/CanopyX/blob/main/docs/data-protocol.md#safe-cell-presenters) or a renderer function. See [one call from records or a URL](https://github.com/EvotecIT/CanopyX/blob/main/docs/enhance.md) for the rest of these options.
