  // ---------- complete-query summaries: nested groups, checked before a page is accepted ----------
  // One level per grouping column, in order. Every level's groups cover their parent's records in contiguous ranges of the
  // complete accepted query, in that level's order: by raw value, or by an aggregate (nulls last, ties by value). Keys are
  // unique across the summary, so collapse state names a group of any level. At most 10,000 groups in all.
  function groupLevelsOf(view, query) {
    const grouping = view.reporting?.grouping;
    return grouping ? [{ column: grouping.column, direction: grouping.direction }] : query?.groupBy || [];
  }
  function groupOrder(view, level) {
    const column = view.columns.find(item => item.id === level.column), compare = reportingGroupCompare(GRID_REPORTING.compare(view));
    const byValue = (a, b, direction) => compare({ cells: { [column.id]: a.value } }, { cells: { [column.id]: b.value } }, column, direction);
    if (!level.aggregate) return (a, b) => byValue(a, b, level.direction);
    return (a, b) => {
      const x = a.aggregates[level.aggregate], y = b.aggregates[level.aggregate];
      if (x === null || y === null) return x === y ? byValue(a, b, "asc") : x === null ? 1 : -1;
      return (level.direction === "desc" ? gridOrder(y, x) : gridOrder(x, y)) || byValue(a, b, "asc");
    };
  }
  function groupSummaryResult(grid, query, page, summary) {
    const view = grid.view;
    checkDocument(summary, "gridSummary");
    if (JSON.stringify(summary).length > 4194304 || summary.view !== view.id || summary.revision !== page.revision || summary.matched !== page.matched ||
        !Array.isArray(summary.groups) || !summary.query ||
        !["protocol", "type", "view", "offset", "limit", "sort", "filters", "search", "revision"].every(key => Object.hasOwn(summary.query, key)) ||
        summary.query.type !== "gridQuery" || summary.query.protocol !== PROTOCOL || summary.query.revision !== page.revision || summary.query.offset !== 0 ||
        JSON.stringify(gridQuery(view, summary.query)) !== JSON.stringify(query)) throw new Error("CanopyX: summary ownership or counts differ.");
    groupCheckValues(view, summary.aggregates, summary.matched);
    const levels = groupLevelsOf(view, query), keys = new Set();
    if (!levels.length && summary.groups.length) throw new Error("CanopyX: an ungrouped summary has no groups.");
    const check = (groups, depth, start, count) => {
      const level = levels[depth], column = view.columns.find(item => item.id === level.column), order = groupOrder(view, level), values = new Set();
      let offset = start, previous = null;
      for (const group of groups) {
        if (!group || typeof group !== "object" || !Object.hasOwn(group, "value") ||
            group.value !== null && typeof group.value === "object") throw new Error("CanopyX: groups carry raw values.");
        requireIdentifier(group.key, "group key"); const value = reportingGroupKey(gridScalar(group.value, column));
        if (group.cells !== undefined) validateGridRows([{ id: group.key, cells: group.cells }], view.columns);
        if (keys.size >= 10000 || group.key.length > 4096 || keys.has(group.key) || values.has(value) || group.offset !== offset ||
            !validStructuralCount(group.count) || !group.count) throw new Error("CanopyX: invalid complete group range.");
        groupCheckValues(view, group.aggregates, group.count);
        if (previous && order(previous, group) >= 0) throw new Error("CanopyX: groups do not follow their level's order.");
        keys.add(group.key); values.add(value); previous = group;
        if (depth + 1 < levels.length) {
          if (!Array.isArray(group.groups) || !group.groups.length) throw new Error("CanopyX: a group of an outer level lists its inner groups.");
          check(group.groups, depth + 1, group.offset, group.count);
        } else if (group.groups !== undefined) throw new Error("CanopyX: a group of the innermost level has no inner groups.");
        offset += group.count;
      }
      if (offset !== start + count) throw new Error("CanopyX: groups omit matching records.");
    };
    if (levels.length) check(summary.groups, 0, 0, summary.matched);
    return gridFreeze(JSON.parse(JSON.stringify(summary)));
  }
  // The groups, outermost first, that hold a record position.
  function groupPath(summary, ordinal) {
    const path = [];
    for (let list = summary.groups; list?.length;) {
      let low = 0, high = list.length;
      while (low < high) { const middle = (low + high) >>> 1; if (list[middle].offset <= ordinal) low = middle + 1; else high = middle; }
      const group = low ? list[low - 1] : null;
      if (!group || ordinal >= group.offset + group.count) break;
      path.push(group); list = group.groups;
    }
    return path;
  }

  // Inline data grouped at runtime: filtered records, grouped level by level (by value, or by an aggregate of each group),
  // then the remaining sorts inside the innermost groups and stable identity last.
  const GROUP_GRIDS = new WeakMap();
  GRID_ROWS.order = (view, query) => {
    const grid = GROUP_GRIDS.get(view), columns = new Map(view.columns.map(column => [column.id, column])), levels = query.groupBy;
    const compare = GRID_REPORTING.compare(view), rest = query.sort.filter(sort => !levels.some(level => level.column === sort.column));
    const within = (a, b) => { for (const sort of rest) { const result = compare(a, b, columns.get(sort.column), sort.direction); if (result) return result; } return gridOrder(a.id, b.id); };
    const arrange = (rows, depth) => {
      if (depth === levels.length) return rows.sort(within);
      const level = levels[depth], column = columns.get(level.column), buckets = new Map();
      for (const row of rows) {
        const key = reportingGroupKey(gridScalar(row.cells[column.id], column));
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(row);
      }
      const groups = [...buckets.values()].map(list => ({ list, value: cellValue(list[0].cells[column.id]) ?? null,
        aggregates: level.aggregate ? { [level.aggregate]: groupAggregateValue(grid, view.reporting.aggregates.find(item => item.id === level.aggregate), list, 0, list.length) } : {} }));
      groups.sort(groupOrder(view, level));
      return groups.flatMap(group => arrange(group.list, depth + 1));
    };
    return arrange(gridQueryRows(view, query, columns, null), 0);
  };
  // An inner key extends its outer key; one that would pass 4,096 code units becomes a stable digest of the same text.
  function groupInnerKey(parent, key) {
    const text = parent + "\u001f" + key;
    if (text.length <= 4096) return text;
    let a = 0x811c9dc5, b = 0x01000193;
    for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); a = Math.imul(a ^ code, 16777619); b = Math.imul(b ^ code, 2246822519) ^ (b >>> 13); }
    return "#" + (a >>> 0).toString(36) + (b >>> 0).toString(36) + ":" + text.length;
  }
  function groupInlineSummary(grid, query) {
    const view = grid.view, columns = new Map(view.columns.map(column => [column.id, column])), levels = groupLevelsOf(view, query);
    const rows = query.groupBy?.length ? GRID_ROWS.order(view, query) : gridQueryRows(view, query, columns, GRID_REPORTING.compare(view));
    let total = 0;
    const build = (start, end, depth, parent) => {
      const column = columns.get(levels[depth].column), groups = [];
      for (let offset = start; offset < end;) {
        const value = cellValue(rows[offset].cells[column.id]) ?? null, key = reportingGroupKey(gridScalar(value, column));
        let last = offset + 1;
        while (last < end && reportingGroupKey(gridScalar(rows[last].cells[column.id], column)) === key) last++;
        // An inner key carries its outer groups' keys, so the same value under another outer group is another group.
        const id = parent === null ? key : groupInnerKey(parent, key);
        if (++total > 10000 || id.length > 4096) throw new Error("CanopyX: inline grouping exceeds its metadata bounds.");
        const group = { key: id, value, offset, count: last - offset, aggregates: groupAggregateValues(grid, rows, offset, last), ...groupWorstCells(view, rows, offset, last) };
        if (depth + 1 < levels.length) group.groups = build(offset, last, depth + 1, id);
        groups.push(group); offset = last;
      }
      return groups;
    };
    return { protocol: PROTOCOL, type: "gridSummary", view: view.id, revision: query.revision, query,
      matched: rows.length, groups: levels.length ? build(0, rows.length, 0, null) : [], aggregates: groupAggregateValues(grid, rows) };
  }
  // A group shows the worst semantic tone of its state and enum columns across all its records, also those on other pages.
  function groupWorstCells(view, rows, first, last) {
    const cells = Object.create(null);
    for (const declared of view.columns) {
      const presenter = declared.presenter || view.reporting.presenters?.[declared.id];
      if (!presenter || !["state", "enum"].includes(presenter.kind)) continue;
      let worst = null, rank = -1;
      for (let index = first; index < last; index++) {
        const cell = rows[index].cells[declared.id], raw = cellValue(cell);
        if (raw == null) continue;
        const next = GRID_TONE_RANK[gridPresenterTone(presenter, raw, isCellObject(cell) ? cell.tone : null)] ?? 2;
        if (next > rank) { worst = cell; rank = next; }
      }
      if (worst !== null) cells[declared.id] = worst;
    }
    return Object.keys(cells).length ? { cells } : {};
  }