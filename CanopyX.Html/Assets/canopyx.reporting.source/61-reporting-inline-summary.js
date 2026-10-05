  // ---------- generic aggregates over the same full-query projection used by inline pages ----------
  function reportingAggregateValues(view, rows, first = 0, last = rows.length) {
    const values = Object.create(null);
    for (const aggregate of view.reporting.aggregates || []) {
      const column = view.columns.find(item => item.id === aggregate.column);
      let count = 0, sum = 0, correction = 0, minimum = Infinity, maximum = -Infinity;
      for (let i = first; i < last; i++) {
        const value = gridScalar(rows[i].cells[column.id], column);
        if (value === null) continue;
        count++;
        if (aggregate.operation !== "count") {
          const next = value - correction, total = sum + next;
          correction = total - sum - next; sum = total;
          minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
        }
      }
      values[aggregate.id] = aggregate.operation === "count" ? count : !count ? null :
        aggregate.operation === "sum" ? sum : aggregate.operation === "average" ? sum / count : aggregate.operation === "minimum" ? minimum : maximum;
    }
    return values;
  }
  function reportingInlineSummary(view, query) {
    const columns = new Map(view.columns.map(column => [column.id, column]));
    const rows = gridQueryRows(view, query, columns, GRID_REPORTING.compare(view)), groups = [], grouping = view.reporting.grouping;
    if (grouping) {
      const column = columns.get(grouping.column);
      for (let offset = 0; offset < rows.length;) {
        const value = cellValue(rows[offset].cells[column.id]) ?? null, scalar = gridScalar(value, column), key = reportingGroupKey(scalar);
        let end = offset + 1;
        while (end < rows.length && reportingGroupKey(gridScalar(rows[end].cells[column.id], column)) === key) end++;
        const cells=Object.create(null);
        for(const declared of view.columns) {
          const presenter=declared.presenter||view.reporting.presenters?.[declared.id];
          if(!presenter||!["state","enum"].includes(presenter.kind))continue;
          let worst=null,rank=-1;
          for(let index=offset;index<end;index++) {
            const cell=rows[index].cells[declared.id],raw=cellValue(cell);if(raw==null)continue;
            const tone=gridPresenterTone(presenter,raw,isCellObject(cell)?cell.tone:null),next=GRID_TONE_RANK[tone]??2;
            if(next>rank){worst=cell;rank=next;}
          }
          if(worst!==null)cells[declared.id]=worst;
        }
        groups.push({ key, value, offset, count: end - offset, aggregates: reportingAggregateValues(view, rows, offset, end), ...(Object.keys(cells).length?{cells}:{}) });
        if (groups.length > 10000 || key.length > 4096) throw new Error("CanopyX: inline grouping exceeds its metadata bounds.");
        offset = end;
      }
    }
    return { protocol: PROTOCOL, type: "gridSummary", view: view.id, revision: query.revision, query,
      matched: rows.length, groups, aggregates: reportingAggregateValues(view, rows) };
  }
