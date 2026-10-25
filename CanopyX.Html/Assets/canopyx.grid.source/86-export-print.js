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
  EXPORT_IMPL.printSnapshot = async function (grid, snapshot, signal, layout, templates, projection) {
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
      const doc = frame.contentDocument, columns = projection ? snapshot.request.columns.filter(column => projection.includes(column.id)) : snapshot.request.columns;
      doc.documentElement.lang = snapshot.request.locale || grid.lang || "en";
      doc.title = grid.view.label;
      const add = (tag, parent, text, css) => {
        const element = doc.createElement(tag);
        if (text !== undefined) element.textContent = String(text);
        if (css) element.style.cssText = css;
        parent.appendChild(element); return element;
      };
      add("style", doc.head, "@page{size:A4 " + (columns.length > 6 ? "landscape" : "portrait") + ";margin:16mm 14mm;@bottom-right{content:counter(page);font:9pt Arial;color:#66717c}}" +
        "thead{display:table-header-group}tfoot{display:table-row-group}tr{break-inside:avoid}a{color:inherit;text-decoration:none}" +
        "@media screen{body{padding:40px}main{max-width:1100px;margin:auto}}@media screen and (max-width:600px){body{padding:20px}}" +
        "@media (max-width:600px){body{font-size:10px!important}td,th{padding:6px 4px!important;white-space:normal!important}td.cx-print-number{white-space:nowrap!important}col.cx-print-date{width:80px!important}}" +
        "@media print{body{padding:0}h1{break-after:avoid}header{break-after:avoid}}");
      doc.body.style.cssText = "margin:0;background:#fff;color:#25313c;font:11px/1.4 Arial,sans-serif";
      const main = add("main", doc.body), reportHeader = add("header", main, undefined, "margin-bottom:22px;padding-bottom:14px;border-bottom:2px solid #334b56");
      add("h1", reportHeader, grid.view.label, "font-size:26px;letter-spacing:-.5px;line-height:1.2;margin:0 0 8px");
      add("p", reportHeader, printContext(grid, snapshot), "margin:0;max-width:90ch;color:#66717c;font-size:11px;line-height:1.6");
      const cellStyle = "padding:5px 8px;border-bottom:1px solid #dce1e5;text-align:left;vertical-align:top;overflow-wrap:anywhere";
      const value = (parent, cell) => {
        const text = cell && typeof cell === "object" ? cell.text ?? cell.value ?? "" : cell ?? "";
        const link = cell && typeof cell === "object" && cell.link?.target;
        if (typeof link === "string" && /^(?:https?:|mailto:)/i.test(link)) {
          const anchor = add("a", parent, text, "color:inherit;text-decoration:none"); anchor.href = link;
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
      const cell = (row, column) => {
        if (!templates || !Object.hasOwn(templates, column.id)) return row.cells[column.id];
        const text = id => {
          if (row.templateText && Object.hasOwn(row.templateText, id)) return row.templateText[id];
          const input = row.cells[id];
          return input && typeof input === "object" ? input.text ?? input.value ?? "" : input ?? "";
        };
        return { text: typeof templates[column.id] === "string" ? templates[column.id].replace(/\{([^{}]+)\}/g, (_, id) => text(id)) : text(column.id) };
      };
      const grouping = snapshot.request.grouping, starts = new Map(), ends = new Map(),
        fmt = formatting(snapshot.request.locale || grid.lang, snapshot.request.timeZone === "local", grid.labels);
      const collect = (groups, depth) => {
        for (const group of groups || []) {
          const headings = starts.get(group.offset) || [];
          headings.push({ text: grouping.levels[depth].title + ": " + group.text, depth }); starts.set(group.offset, headings);
          const footers = ends.get(group.offset + group.count) || [];
          footers.unshift({ text: grouping.levels[depth].title + ": " + group.text, values: group.aggregates, depth });
          ends.set(group.offset + group.count, footers);
          collect(group.groups, depth + 1);
        }
      };
      if (grouping) collect(grouping.groups, 0);
      if (layout === "stacked") {
        const summary = (values, label, subtotal) => {
          if (!values || !grouping?.aggregates.length) return;
          const section = add("div", main, undefined, "break-inside:avoid;padding:8px 10px;margin:0 0 12px;background:#f4f6f7;border-top:1px solid #c8ccd0;font-weight:600");
          section.setAttribute(subtotal ? "data-cx-print-subtotal" : "data-cx-print-total", "");
          add("div", section, label);
          for (const aggregate of grouping.aggregates) {
            const column = columns.find(column => column.id === aggregate.column);
            if (column) add("div", section, (aggregate.label || column.title) + ": " + cellText(values[aggregate.id], column, fmt));
          }
        };
        for (const [index, row] of snapshot.rows.entries()) {
          for (const heading of starts.get(index) || []) add("h2", main, heading.text, "font-size:15px;margin:12px 0 6px");
          const section = add("section", main, undefined, "break-inside:avoid;border:1px solid #c8ccd0;margin:0 0 12px;padding:10px"), list = add("dl", section);
          for (const column of columns) {
            add("dt", list, column.title, "font-weight:600;margin:4px 0 0");
            value(add("dd", list, undefined, "margin:0;overflow-wrap:anywhere"), cell(row, column));
          }
          if (row.detail) detail(add("div", section, undefined, "margin-top:8px"), row.detail);
          for (const group of ends.get(index + 1) || []) summary(group.values, group.text, true);
        }
        summary(grouping?.totals, grid.labels.gridSummary, false);
      } else {
        const table = add("table", main, undefined, "border-collapse:collapse;width:100%;font:inherit"), head = add("thead", table), header = add("tr", head);
        const widths = add("colgroup", table); table.insertBefore(widths, head);
        for (const column of columns) {
          const col = add("col", widths, undefined, column.kind === "number" ? "width:1%" : column.kind === "datetime" ? "width:144px" : undefined);
          if (column.kind === "datetime") col.className = "cx-print-date";
          add("th", header, column.title, cellStyle + ";overflow-wrap:normal;background:#edf1f3;font-weight:600;white-space:nowrap" + (column.kind === "number" ? ";text-align:right" : ""));
        }
        const body = add("tbody", table);
        const summary = (parent, values, label, subtotal) => {
          if (!values || !grouping?.aggregates.length) return;
          const tr = add("tr", parent); tr.setAttribute(subtotal ? "data-cx-print-subtotal" : "data-cx-print-total", "");
          for (const [index, column] of columns.entries()) {
            const summaries = grouping.aggregates.filter(aggregate => aggregate.column === column.id),
              td = add("td", tr, summaries.length ? undefined : index === 0 ? label : "", cellStyle + ";font-weight:600;background:#f4f6f7" +
                (column.kind === "number" ? ";text-align:right" : ""));
            for (const aggregate of summaries) {
              const pair = add("div", td);
              add("span", pair, (aggregate.label || aggregate.operation) + ": ", "display:block;color:#66717c;font-size:9px;font-weight:400");
              add("span", pair, cellText(values[aggregate.id], column, fmt), "display:block;white-space:nowrap");
            }
          }
        };
        for (const [index, row] of snapshot.rows.entries()) {
          for (const heading of starts.get(index) || []) {
            const group = add("tr", body), title = add("th", group, heading.text, cellStyle + ";background:#f3f4f6");
            title.colSpan = columns.length; title.style.paddingInlineStart = (8 + heading.depth * 12) + "px";
          }
          const tr = add("tr", body, undefined, "break-inside:avoid"); tr.setAttribute("data-cx-print-record", "");
          for (const column of columns) {
            const td = add("td", tr, undefined, cellStyle);
            if (column.kind === "number") { td.className = "cx-print-number"; td.style.textAlign = "right"; td.style.whiteSpace = "nowrap"; }
            value(td, cell(row, column));
          }
          if (row.detail) {
            const next = add("tr", body), holder = add("td", next, undefined, cellStyle); holder.colSpan = columns.length;
            detail(holder, row.detail);
          }
          for (const group of ends.get(index + 1) || []) summary(body, group.values, group.text, true);
        }
        summary(add("tfoot", table), grouping?.totals, grid.labels.gridSummary, false);
      }
      await doc.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      gridOperationActive(grid, signal);
      frame.contentWindow.focus(); frame.contentWindow.print();
    } finally { signal?.removeEventListener("abort", dispose); dispose(); }
  };
