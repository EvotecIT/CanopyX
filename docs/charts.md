# Chart analysis

Reporting grids opt into the Chart action with `CanopyGridReporting.Chartable = true`, or `reporting.chartable` in a view document. The optional ChartForgeX browser renderer loads on first use. Ordinary grids carry no chart payload.

The Chart dialog offers filtered records, selected records, the selected cell range, accepted groups and the active pivot. It suggests a line for increasing date categories, bars for ordinary categories and stacked columns for multi-series pivots. Record and group charts start with one measure. The Values picker lets readers select the measures to compare. Pivot charts start with the first aggregate across its column categories. The type picker also offers area, column, win/loss and bullet charts. Bullet accepts a measure and an optional target series.

```javascript
await grid.openChart({ source: "selected", category: "region", values: ["amount"] });
await grid.openChart({ source: "range", category: "placed", values: ["amount"] });
await grid.openChart({ source: "groups", values: ["total"] });
await grid.openChart({ source: "pivot" });
```

Record and range charts use raw numeric values and displayed category captions. Range capture uses the same projected row positions and missing-page loading as cell copying. Record capture respects the accepted query, selection and revision, including all-matching selection. It reads at most 10,000 records and fails explicitly above the bound. A range needs one compatible column span. Group and pivot charts use the complete accepted analysis result and declared aggregates. `group` can name an accepted group's key to chart its children. `values` names column IDs for record/range charts, aggregate IDs for group charts and exported value-column IDs for pivots.

Clicking a mark adds a removable linked filter under the chart's own source. Missing and bucketed group categories retain native null and bucket predicates. Other reader filters remain in the query. The Clear chart filter button removes only that source. Accepted query and selection changes refresh the open chart. Closing the dialog cancels its capture and disposes the renderer.

## Chart cells

Numeric columns can use `CanopyGridPresenter.SparklineArea()`, `SparklineColumns()`, `SparklineWinLoss()` or `Bullet(target)`. The first three read the cell's numeric history. Bullet compares the current raw value with its authored finite target. Querying and exports retain the original values. Static output keeps the text value. Cells share one optional renderer payload, and recycled rows release their old drawings.

## Pivot files

The export menu offers Excel and PDF for the filtered result of an active pivot. Those two actions are disabled for Selected rows and All results, while record export formats retain their ordinary scopes. Released OfficeIMO constructs the files from CanopyX's accepted pivot capture. Excel preserves typed values and native row/column outlines, including collapsed and hidden states. PDF prints the hierarchy, headings and values with repeated headers. Excel outline controls have no PDF counterpart, and the export reports OfficeIMO's `PIVOT_OUTLINES_XLSX_ONLY` diagnostic. Unsupported PDF presentation rules continue to report errors.

Pivot charts retain all accepted leaf values when row or column branches collapse. Pivots with more than 32 value columns start with one value, and their complete Values picker lets readers choose up to the renderer's 32-series limit. Explicit value selections bind to the column-axis category and aggregate identity. Filtering can reorder the exported columns without changing the selected value. If a selected category disappears, the chart clears, the picker receives focus, and the no-data status asks for a new selection through the current choices.
