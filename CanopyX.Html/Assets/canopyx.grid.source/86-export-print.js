  // ---------- bounded static print from export records, independent of virtual viewport DOM ----------
  EXPORT_IMPL.snapshot = async function (grid, capture, maxRows, signal, progress = () => {}) {
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 10000) throw new Error("CanopyX: print snapshots support 1 to 10000 records.");
    if (capture.request.recordCount !== null && capture.request.recordCount > maxRows)
      throw new Error("CanopyX: snapshot exceeds its row bound; use a host export hook.");
    const rows = []; let size = JSON.stringify(capture.request).length;
    if (size > 4194304) throw new Error("CanopyX: snapshot exceeds its text bound; use a host export hook.");
    progress("reading", 0);
    for await (const row of grid.exportRows(capture.request, signal)) {
      if (rows.length >= maxRows || (size += JSON.stringify(row).length + 1) > 4194304)
        throw new Error("CanopyX: snapshot exceeds its row or text bound; use a host export hook.");
      rows.push(row); if (rows.length % 100 === 0) progress("reading", rows.length);
    }
    gridOperationActive(grid, signal); progress("generating", rows.length);
    return gridFreeze({ request: capture.request, rows });
  };
  EXPORT_IMPL.printSnapshot = async function (grid, snapshot, signal, layout, templates) {
    gridOperationActive(grid, signal);
    for (const row of snapshot.rows) if (row.detail != null) {
      const detail = row.detail;
      if (detail.type === "html") throw new Error("CanopyX: HTML print details require an onPrint hook or includeDetails: false.");
      if (detail.type === "table" ? !Array.isArray(detail.columns) || !Array.isArray(detail.rows) ||
          detail.rows.some(cells => !Array.isArray(cells) || cells.length !== detail.columns.length) :
          detail.type !== "properties" || !Array.isArray(detail.items)) throw new Error("CanopyX: invalid static print detail payload.");
    }
    const frame = document.createElement("iframe"); frame.title = grid.labels.gridPrint;
    frame.style.cssText = "position:fixed;width:1px;height:1px;inset:0;border:0;clip-path:inset(100%)";
    document.body.appendChild(frame);
    const dispose = () => frame.remove();
    signal?.addEventListener("abort", dispose, { once: true });
    try {
      const doc = frame.contentDocument, columns = snapshot.request.columns;
      doc.documentElement.lang = snapshot.request.locale || grid.lang || "en";
      doc.title = grid.view.label;
      const add = (tag, parent, text, css) => {
        const element = doc.createElement(tag);
        if (text !== undefined) element.textContent = String(text);
        if (css) element.style.cssText = css;
        parent.appendChild(element); return element;
      };
      doc.body.style.cssText = "margin:0;background:#fff;color:#1f2328;font:12px/1.4 Arial,sans-serif";
      const main = add("main", doc.body); add("h1", main, grid.view.label, "font-size:20px;margin:0 0 12px");
      const cellStyle = "padding:6px 8px;border:1px solid #c8ccd0;text-align:left;vertical-align:top;overflow-wrap:anywhere";
      const value = (parent, cell) => {
        const text = cell && typeof cell === "object" ? cell.text ?? cell.value ?? "" : cell ?? "";
        const link = cell && typeof cell === "object" && cell.link?.target;
        if (typeof link === "string" && /^(?:https?:|mailto:)/i.test(link)) {
          const anchor = add("a", parent, text); anchor.href = link;
          if (cell.link.tooltip) anchor.title = cell.link.tooltip;
        } else parent.textContent = String(text);
      };
      const detail = (parent, payload) => {
        parent.setAttribute("data-cx-print-detail", "");
        if (payload.type === "table") {
          const table = add("table", parent, undefined, "border-collapse:collapse;width:100%;font:inherit");
          if (payload.caption) add("caption", table, payload.caption, "text-align:left;font-weight:600;margin:4px 0");
          const headings = add("tr", add("thead", table));
          for (const column of payload.columns) add("th", headings, column, cellStyle + ";overflow-wrap:normal");
          const body = add("tbody", table);
          for (const cells of payload.rows) {
            const row = add("tr", body);
            for (const cell of cells) value(add("td", row, undefined, cellStyle), cell);
          }
        } else {
          const list = add("dl", parent);
          for (const item of payload.items) {
            add("dt", list, item.name, "font-weight:600");
            value(add("dd", list, undefined, "margin:0 0 6px;overflow-wrap:anywhere"), item.value);
          }
        }
      };
      const cell = (row, column) => templates && Object.hasOwn(templates, column.id) ? {
        text: templates[column.id].replace(/\{([^{}]+)\}/g, (_, id) => {
          const input = row.cells[id];
          return input && typeof input === "object" ? input.text ?? input.value ?? "" : input ?? "";
        })
      } : row.cells[column.id];
      const grouping = snapshot.request.grouping, starts = new Map();
      const collect = (groups, depth) => {
        for (const group of groups || []) {
          const headings = starts.get(group.offset) || [];
          headings.push({ text: grouping.levels[depth].title + ": " + group.text, depth }); starts.set(group.offset, headings);
          collect(group.groups, depth + 1);
        }
      };
      if (grouping) collect(grouping.groups, 0);
      if (layout === "stacked") {
        for (const [index, row] of snapshot.rows.entries()) {
          for (const heading of starts.get(index) || []) add("h2", main, heading.text, "font-size:15px;margin:12px 0 6px");
          const section = add("section", main, undefined, "break-inside:avoid;border:1px solid #c8ccd0;margin:0 0 12px;padding:10px"), list = add("dl", section);
          for (const column of columns) {
            add("dt", list, column.title, "font-weight:600;margin:4px 0 0");
            value(add("dd", list, undefined, "margin:0;overflow-wrap:anywhere"), cell(row, column));
          }
          if (row.detail) detail(add("div", section, undefined, "margin-top:8px"), row.detail);
        }
      } else {
        const table = add("table", main, undefined, "border-collapse:collapse;width:100%;font:inherit"), head = add("thead", table), header = add("tr", head);
        for (const column of columns) add("th", header, column.title, cellStyle + ";overflow-wrap:normal;background:#f3f4f6;font-weight:600");
        const body = add("tbody", table);
        for (const [index, row] of snapshot.rows.entries()) {
          for (const heading of starts.get(index) || []) {
            const group = add("tr", body), title = add("th", group, heading.text, cellStyle + ";background:#f3f4f6");
            title.colSpan = columns.length; title.style.paddingInlineStart = (8 + heading.depth * 12) + "px";
          }
          const tr = add("tr", body, undefined, "break-inside:avoid");
          for (const column of columns) {
            const td = add("td", tr, undefined, cellStyle);
            if (column.kind === "number") td.style.textAlign = "right";
            value(td, cell(row, column));
          }
          if (row.detail) {
            const next = add("tr", body), holder = add("td", next, undefined, cellStyle); holder.colSpan = columns.length;
            detail(holder, row.detail);
          }
        }
        if (grouping?.totals && grouping.aggregates.length) {
          const footer = add("tr", add("tfoot", table)), fmt = formatting(snapshot.request.locale || grid.lang, snapshot.request.timeZone === "local", grid.labels);
          for (const [index, column] of columns.entries()) {
            const summaries = grouping.aggregates.filter(aggregate => aggregate.column === column.id).map(aggregate =>
              (aggregate.label || column.title) + ": " + cellText(grouping.totals[aggregate.id], column, fmt));
            add("td", footer, summaries.join(" · ") || (index === 0 ? grid.labels.gridSummary : ""), cellStyle + ";font-weight:600");
          }
        }
      }
      await doc.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      gridOperationActive(grid, signal);
      frame.contentWindow.focus(); frame.contentWindow.print();
    } finally { signal?.removeEventListener("abort", dispose); dispose(); }
  };
