  // ---------- record panel: collections ----------
  // A collection is { columns, rows, total?, pageLength?, pageSize?, target? } (rows of { id, cells }) or { columns, roots } for
  // a tree. It shows as a nested CanopyX grid with its own sorting, search and paging (a nested tree for roots, or on the
  // tree runtimes), as cards on phones and as a plain table in print. Rows past the ones it carries load through the
  // record's source ("Load more" asks for the field from offset). target { view, column?, values?, filters? } names the view
  // whose records the rows are: a row opens that record, and "Open all in grid" filters that grid (a host can take it over).
  let recordNestedSeq = 0;
  function recordEmit(view, name, detail) {
    let go = view.host.dispatchEvent(new CustomEvent("canopyx:" + name, { detail, cancelable: true, bubbles: true }));
    const callback = view.opts["on" + name[0].toUpperCase() + name.slice(1)];
    if (typeof callback === "function") { try { go = callback(detail) !== false && go; } catch (error) { console.error(error); } }
    return go;
  }
  const recordRowRef = (list, row) => list.target?.view ? { view: list.target.view, id: row.id } :
    list.columns.map(column => row.cells?.[column.id]).find(cell => isCellObject(cell) && recordRefValid(cell.ref))?.ref || null;

  const recordCollectionComplete = list => !!list.roots || !Number.isInteger(list.total) || list.rows.length >= list.total;
  const recordTargetFilters = target => Array.isArray(target.filters) && target.filters.length ? target.filters : null;
  const recordTargetValues = target => Array.isArray(target.values) && target.values.length ? target.values : null;
  const recordCanOpenAll = list => !!recordTargetFilters(list.target) || !!(list.target.column && recordTargetValues(list.target)) ||
    recordCollectionComplete(list) && (!list.target.column || !!recordCollectionIds(list, 1000)?.length);
  function recordCollectionIds(list, maximum = Infinity) {
    if (!list.roots) return list.rows.length > maximum ? null : list.rows.map(row => row.id);
    const ids = [], pending = [list.roots[Symbol.iterator]()];
    while (pending.length) {
      const next = pending[pending.length - 1].next();
      if (next.done) { pending.pop(); continue; }
      if (ids.length >= maximum) return null;
      const node = next.value; ids.push(node.id);
      if (node.children?.length) pending.push(node.children[Symbol.iterator]());
    }
    return ids;
  }

  function recordCollection(ctx, field, list, element) {
    if (!list || typeof list !== "object" || !Array.isArray(list.columns) || !list.columns.length || list.columns.some(column => !column || !column.id || !recordText(column.title)) ||
        (list.roots !== undefined ? !Array.isArray(list.roots) : list.rows !== undefined && !Array.isArray(list.rows))) recordFail("a collection has columns and rows (or tree roots).");
    list.rows ||= [];
    const rows = list.rows, total = Number.isInteger(list.total) ? Math.max(list.total, rows.length) : (list.roots || rows).length, labels = ctx.labels;
    const block = h("div", "cx-record-collection"), head = h("div", "cx-record-collection-h"), count = h("span", "cx-record-count");
    // The count shows when it tells something: more rows than the list carries, or more than fit at a glance.
    setText(count, list.roots || total === rows.length ? fill(labels.recordItems, { count: recordCount(ctx, total) }) :
      fill(labels.recordCount, { shown: recordCount(ctx, rows.length), total: recordCount(ctx, total) }));
    if (total > 5 || total > rows.length || ctx.print) head.appendChild(count);
    if (!ctx.print && list.target?.view) {
      const openAll = recordButton(labels.recordOpenAll, () => recordOpenAll(ctx, field, list).catch(error => ctx.view.emit("error", { error })), "cx-record-open-all", "open");
      // An implicit ID condition needs the whole collection; an explicit target describes it without loading every row.
      openAll.disabled = !recordCanOpenAll(list); head.appendChild(openAll);
    }
    const body = h("div", "cx-record-collection-b");
    if (head.firstChild) block.appendChild(head);
    block.appendChild(body);
    if (ctx.print) recordTable(ctx, list, body);
    else if (ctx.phone && !list.roots) recordCards(ctx, field, list, body);
    else recordNested(ctx, field, list, body);
    if (!ctx.print && !list.roots && rows.length < total && recordLoader(ctx.view)) {
      const more = recordButton(labels.recordLoadMore, () => recordMore(ctx, field, list, more), "cx-record-load-more");
      block.appendChild(more);
    }
    element.appendChild(block);
  }

  function recordNested(ctx, field, list, body) {
    const grid = recordGridHelpers(), host = h("div", "cx-host cx-record-nested"), rows = list.rows, tree = !!list.roots || !grid.createDataGrid;
    host.setAttribute("data-cx-theme", ctx.view.host.getAttribute("data-cx-theme") || "auto");
    const columns = list.columns.map(column => ({ kind: "text", sortable: true, ...column })), id = "cx-record-" + ++recordNestedSeq;
    // Rows keep the order they come in: the nested grid sees positional ids and maps them back to the records.
    const byKey = new Map(rows.map((row, at) => ["r" + String(at).padStart(6, "0"), row]));
    const open = item => { const row = byKey.get(item.id) || item, ref = recordRowRef(list, row); if (ref) ctx.navigate(ref, host); };
    let api;
    if (tree) {
      const roots = list.roots || rows.map(row => ({ id: row.id, label: recordRowTitle(list, row, ctx.fmt), cells: row.cells }));
      host.classList.add("cx-record-nested-tree");
      api = createTreeGrid(host, { view: { protocol: PROTOCOL, type: "view", id, label: field.title, columns, source: { kind: "inline" }, roots, rowHeight: 30 },
        labels: ctx.view.opts.labels, toolbar: false, onDetails: ({ node }) => open(node) });
    } else {
      const length = Math.min(Math.max(list.pageLength || 10, 1), 100), paged = rows.length > length;
      api = grid.createDataGrid(host, { view: { protocol: PROTOCOL, type: "grid", id, label: field.title, rowHeight: 30, pageSize: Math.min(10000, Math.max(rows.length, 1)),
        selection: "none", search: rows.length > 8, columns, source: { kind: "inline" }, rows: [...byKey].map(([key, row]) => ({ ...row, id: key })),
        toolbar: { filters: false, columns: false, views: false, export: false, more: false, count: false, columnMenus: false },
        ...(paged ? { presentation: "paged", pageLength: length } : {}),
        rowAction: rows.some(row => recordRowRef(list, row)) ? "details" : "none" },
      labels: ctx.view.opts.labels, ...(rows.length > 8 ? {} : { toolbar: false }),
      onDetails: ({ row }) => open(row) });
    }
    host.style.setProperty("--cx-record-rows", String(Math.min(tree ? (list.roots || rows).length : Math.min(rows.length, list.pageLength || 10), 12)));
    body.appendChild(host);
    recordOnDispose(ctx.signal, () => api.destroy());
    api.ready?.catch(error => { if (!ctx.signal.aborted) ctx.view.emit("error", { error }); });
  }

  // Phones: one card per row, its first column as the title (a link when the row opens a record), then the other fields.
  function recordCards(ctx, field, list, body) {
    const holder = h("div", "cx-record-cards"), rows = list.rows, columns = list.columns, step = 10;
    const card = row => {
      const item = h("div", "cx-record-card"), title = h("div", "cx-record-card-title"), ref = recordRowRef(list, row), text = recordRowTitle(list, row, ctx.fmt);
      item.setAttribute("role", "group"); item.setAttribute("aria-label", text);
      if (ref) recordLink(ctx, { value: text, ref }, { id: field.id, kind: "text" }, title); else setText(title, text);
      const fields = h("dl", "cx-dl");
      for (const column of columns.slice(1)) {
        const cell = row.cells?.[column.id], spec = { id: column.id, title: column.title, kind: column.kind || "text" };
        if (recordEmpty(cell, spec, ctx.fmt)) continue;
        const term = h("dt"), value = h("dd"); setText(term, column.title); recordValue(ctx, spec, cell, value, 1); fields.append(term, value);
      }
      item.append(title, fields); return item;
    };
    for (const row of rows.slice(0, step)) holder.appendChild(card(row));
    body.appendChild(holder);
    if (rows.length > step) {
      const more = recordButton(fill(ctx.labels.recordShowAll, { count: recordCount(ctx, rows.length) }), () => {
        more.remove(); for (const row of rows.slice(step)) holder.appendChild(card(row)); holder.children[step]?.querySelector("button")?.focus();
      }, "cx-record-more");
      body.appendChild(more);
    }
  }

  // Print: every row (tree levels indented) in a plain table.
  function recordTable(ctx, list, body) {
    const table = h("table", "cx-record-table"), head = h("tr"), thead = h("thead"), tbody = h("tbody");
    for (const column of list.columns) { const cell = h("th"); setText(cell, column.title); head.appendChild(cell); }
    const add = (row, level) => {
      const line = h("tr");
      list.columns.forEach((column, index) => {
        const cell = h("td"), value = row.cells?.[column.id] ?? (index ? null : row.label);
        if (!index && level) cell.style.paddingInlineStart = (level * 16 + 6) + "px";
        recordValue(ctx, { id: column.id, title: column.title, kind: column.kind || "text" }, value, cell, 1); line.appendChild(cell);
      });
      tbody.appendChild(line);
      for (const child of row.children || []) add(child, level + 1);
    };
    for (const row of list.roots || list.rows) add(row, 0);
    thead.appendChild(head); table.append(thead, tbody); body.appendChild(table);
  }

  async function recordMore(ctx, field, list, button) {
    button.disabled = true; setText(button, ctx.labels.loading);
    try {
      const payload = await recordFetch(ctx.view, ctx.record.id, { field: field.id, offset: list.rows.length, limit: list.pageSize || 50 }, ctx.signal);
      if (ctx.signal.aborted) return;
      const page = (payload?.fields?.[field.id] ?? payload?.cells?.[field.id])?.records;
      if (!page || !Array.isArray(page.rows)) recordFail("a field page answers with the field's records.");
      const known = new Set(list.rows.map(row => row.id));
      // Offset is the number of accepted identities. Reject an overlapping or malformed page as a whole so a retry
      // asks for the same offset, rather than silently deduplicating it and guessing how far the source advanced.
      validateGridRows(page.rows, list.columns.map(column => ({ kind: "text", ...column })), known);
      const total = page.total ?? list.total;
      if (total != null && (!Number.isInteger(total) || total < known.size)) recordFail("a collection page's total cannot be below its accepted rows.");
      if (!page.rows.length && (!Number.isInteger(total) || total > known.size)) recordFail("a collection page cannot end before its declared total.");
      list.rows.push(...page.rows);
      if (page.total != null) list.total = page.total;
      ctx.repaint();
    } catch (error) {
      if (!button.isConnected) return;
      button.disabled = false; setText(button, ctx.labels.recordLoadMore);
      recordAnnounce(ctx.dialog, fill(ctx.labels.recordLoadFailed, { error: error.message })); ctx.view.emit("error", { error });
    }
  }

  // "Open all in grid": the canopyx:openAll event (cancelable) and onOpenAll({ view, filters, ids, field, record, total }) come
  // first; then the target grid takes the filters (target.filters, or column in values or the rows' ids) and the drawer closes.
  async function recordOpenAll(ctx, field, list) {
    if (!recordCanOpenAll(list)) return;
    const target = list.target, ids = recordCollectionIds(list), explicitFilters = recordTargetFilters(target);
    const filters = explicitFilters || (target.column ? [{ column: target.column, operator: "in", values: recordTargetValues(target) || ids }] : null);
    const detail = Object.freeze({ view: target.view, filters, ids, field: field.id, record: ctx.record.id, total: Number.isInteger(list.total) ? list.total : (list.roots || list.rows).length });
    if (!recordEmit(ctx.view, "openAll", detail)) return;
    const api = recordApi(target.view);
    if (!api || !filters || api.view.type !== "grid") { recordAnnounce(ctx.dialog, fill(ctx.labels.recordUnavailable, { id: target.view })); return; }
    // With the link part in, a one-column list goes through the grid's external filter API (linked views): a removable chip
    // that names the record and the field, combined with the reader's own conditions. Without it, and for filter groups the
    // host declared, the list replaces the query's filters and search.
    const values = !explicitFilters && target.column && filters[0].values, linked = RECORD_IMPL.grid?.DataGrid?.prototype.setExternalFilter;
    let external;
    if (values && typeof linked === "function" && !linked.linkStub && typeof api.setExternalFilter === "function") {
      // A chip names its source in at most 128 characters.
      let sourceLabel = (ctx.dialog.querySelector(".cx-drawer-h h4")?.textContent || ctx.record.id) + " · " + (field.title || field.id);
      if (sourceLabel.length > 128) sourceLabel = sourceLabel.slice(0, 127) + "…";
      // A list the link part refuses (beyond its limits) falls back to the query's filters below.
      external = await Promise.resolve().then(() => api.setExternalFilter("record-" + field.id, { field: target.column, values, sourceLabel, label: fill(ctx.labels.recordItems, { count: recordCount(ctx, values.length) }) }))
        .then(() => true, () => false);
    } else external = false;
    if (!external) {
      const query = api.getQuery() || {};
      await api.setQuery({ sort: query.sort || [], search: "", filters });
    }
    ctx.dialog.close();
    api.element.scrollIntoView({ block: "start" }); api.focus();
  }
