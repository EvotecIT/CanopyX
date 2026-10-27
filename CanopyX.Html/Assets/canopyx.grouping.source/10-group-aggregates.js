  // Group summaries and footer rows share the aggregate implementation.
  function groupAggregateValues(grid, rows, first = 0, last = rows.length) {
    const values = Object.create(null);
    for (const aggregate of groupSummaryAggregates(grid.view)) values[aggregate.id] = groupAggregateValue(grid, aggregate, rows, first, last);
    return values;
  }
  GRID_ROWS.aggregateValue = groupAggregateValue;
  // The aggregates of a summary or a group: every declared binding, counts within the record count, numbers in range.
  function groupCheckValues(view, values, count) {
    const declarations = groupSummaryAggregates(view);
    if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length !== declarations.length)
      throw new Error("CanopyX: summary aggregate bindings differ.");
    for (const aggregate of declarations) {
      const value = values[aggregate.id];
      if (!Object.hasOwn(values, aggregate.id) || value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) ||
          groupCounting(aggregate.operation) && (!validStructuralCount(value) || value > count) ||
          !count && !groupCounting(aggregate.operation) && value !== null) throw new Error("CanopyX: invalid aggregate value.");
    }
  }
  const GROUP_MEASURE = DataGrid.prototype.measureGridColumn;
  Object.assign(DataGrid.prototype, {
    // A column with aggregates is as wide as its widest labelled aggregate (totals and up to 200 groups), within the usual cap.
    measureGridColumn(column) {
      const result = GROUP_MEASURE.call(this, column), summary = this.summaryCandidate?.result || this.summary;
      const aggregates = this.rowsAttached && summary && !column.fixed && (this.view.reporting.aggregates || []).filter(item => item.column === column.id);
      if (!aggregates?.length || !this.fitContext) return result;
      const context = this.fitContext, pad = this.fitFont[3]; let widest = 0, seen = 0;
      context.font = this.fitFont[0].replace(/^\S+/, "700");
      const measure = values => { widest = Math.max(widest, context.measureText(reportingAggregateParts(this, column, aggregates, values).text).width); };
      measure(summary.aggregates);
      const walk = list => { for (const group of list || []) { if (++seen > 200) return; measure(group.aggregates); walk(group.groups); } };
      walk(summary.groups);
      const need = Math.min(Math.max(420, result.width), Math.ceil(widest + 2 * pad + 4));
      return need > result.width ? Object.freeze({ ...result, width: need }) : result;
    },
    // A cell of aggregates: "avg 36.2 · max 98" in the reporting runtime's labelled format, the declared labels with full
    // values as its tooltip and accessible name. A bounded button opens the complete values without covering other cells.
    paintAggregates(cell, column, aggregates, values) {
      const parts = reportingAggregateParts(this, column, aggregates, values);
      cell.title = parts.title; cell.classList.add("cx-aggregate");
      if (parts.text) cell.setAttribute("aria-label", parts.title); else cell.removeAttribute("aria-label");
      if (!parts.text) { cell.replaceChildren(); return; }
      let button = cell.querySelector(":scope > .cx-aggregate-button");
      if (!button) {
        button = h("button", "cx-grid-group-aggregates cx-aggregate-button"); button.type = "button";
        button.setAttribute("aria-haspopup", "dialog"); cell.replaceChildren(button);
        button.addEventListener("click", event => {
          event.stopPropagation(); this.showAggregateMenu(column, aggregates, button._cxAggregateValues, button).catch(error => this.emit("error", { error }));
        });
      }
      if (button.textContent !== parts.text + (parts.caption || "")) {
        setText(button, parts.text);
        if (parts.caption) { const caption = h("span", "cx-aggregate-caption"); setText(caption, parts.caption); button.append(caption); }
      }
      button._cxAggregateValues = values;
      button._cxAggregateText = parts.title; button.title = parts.title; button.setAttribute("aria-label", parts.title);
    }
  });
