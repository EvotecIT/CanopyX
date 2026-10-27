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
  EXPORT_IMPL.printSnapshot = async function (grid, snapshot, signal, layout, templates, projection, cardRoles) {
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
      doc.documentElement.style.colorScheme = "light";
      const theme = getComputedStyle(grid.host);
      // Paper uses the shared light palette; host typography can follow its report identity.
      for (const name of theme) if (/^--hfx-(?:font|type|weight)-/.test(name)) doc.documentElement.style.setProperty(name, theme.getPropertyValue(name));
      const add = (tag, parent, text, css) => {
        const element = doc.createElement(tag);
        if (text !== undefined) element.textContent = String(text);
        if (css) element.style.cssText = css;
        parent.appendChild(element); return element;
      };
      add("style", doc.head, "@page{size:A4 " + (layout !== "stacked" && columns.length > 6 ? "landscape" : "portrait") + ';margin:16mm 14mm;@bottom-right{content:counter(page);font:var(--hfx-type-caption-size) var(--hfx-font-sans);color:var(--hfx-color-text-muted)}}' +
        "thead{display:table-header-group}tfoot{display:table-row-group}tr{break-inside:avoid}a{color:inherit;text-decoration:none}" +
        "@media screen{body{padding:40px}main{max-width:1100px;margin:auto}}@media screen and (max-width:600px){body{padding:20px}}" +
        "@media (max-width:600px){body{font-size:10px!important}td,th{padding:6px 4px!important;white-space:normal!important}td.cx-print-number{white-space:nowrap!important}col.cx-print-date{width:80px!important}}" +
        ".cx-print-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}" +
        ".cx-print-card{break-inside:avoid;min-width:0;border:1px solid var(--hfx-color-border);border-radius:var(--hfx-radius-container);padding:16px}" +
        ".cx-print-card-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;margin:0 0 14px}" +
        ".cx-print-card h2{flex:1;margin:0;font-size:16px;line-height:1.3;overflow-wrap:anywhere}" +
        ".cx-print-card-status{border:1px solid var(--hfx-color-border-strong);border-radius:var(--hfx-radius-pill);padding:2px 7px;font-size:10px}" +
        ".cx-print-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;margin:0}" +
        ".cx-print-card dt{color:var(--hfx-color-text-muted);font-size:10px;margin:0 0 3px}.cx-print-card dd{margin:0;overflow-wrap:anywhere}" +
        ".cx-print-card footer{border-top:1px solid var(--hfx-color-border);padding-top:10px;margin-top:14px;color:var(--hfx-color-text-muted)}" +
        ".cx-print-card footer span+span{margin-inline-start:6px}.cx-print-card-wide,.cx-print-cards>h2,.cx-print-cards>[data-cx-print-subtotal],.cx-print-cards>[data-cx-print-total]{grid-column:1/-1}" +
        "@media screen and (min-width:1200px){.cx-print-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}" +
        "@media screen and (max-width:600px){.cx-print-cards{grid-template-columns:minmax(0,1fr)}}" +
        "@media print{body{padding:0}h1{break-after:avoid}header{break-after:avoid}}");
      doc.body.style.cssText = 'margin:0;background:var(--hfx-color-surface);color:var(--hfx-color-text);font:11px/1.4 var(--hfx-font-sans)';
      const main = add("main", doc.body), reportHeader = add("header", main, undefined, "margin-bottom:22px;padding-bottom:14px;border-bottom:2px solid var(--hfx-color-border-strong)");
      add("h1", reportHeader, grid.view.label, "font-size:26px;letter-spacing:-.5px;line-height:1.2;margin:0 0 8px");
      add("p", reportHeader, printContext(grid, snapshot), "margin:0;max-width:90ch;color:var(--hfx-color-text-muted);font-size:11px;line-height:1.6");
      const cellStyle = "padding:5px 8px;border-bottom:1px solid var(--hfx-color-border);text-align:left;vertical-align:top;overflow-wrap:anywhere";
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
          if (payload.caption) add("caption", table, payload.caption, "text-align:left;font-weight:var(--hfx-weight-semibold);margin:4px 0");
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
            add("dt", list, item.name, "font-weight:var(--hfx-weight-semibold)");
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
        const cards = add("div", main); cards.className = "cx-print-cards";
        const summary = (values, label, subtotal) => {
          if (!values || !grouping?.aggregates.length) return;
          const section = add("div", cards, undefined, "break-inside:avoid;padding:8px 10px;margin:0 0 12px;background:var(--hfx-color-surface-sunken);border-top:1px solid var(--hfx-color-border);font-weight:var(--hfx-weight-semibold)");
          section.setAttribute(subtotal ? "data-cx-print-subtotal" : "data-cx-print-total", "");
          add("div", section, label);
          for (const aggregate of grouping.aggregates) {
            const column = columns.find(column => column.id === aggregate.column);
            if (column) add("div", section, (aggregate.label || column.title) + ": " + cellText(values[aggregate.id], column, fmt));
          }
        };
        for (const [index, row] of snapshot.rows.entries()) {
          for (const heading of starts.get(index) || []) add("h2", cards, heading.text, "font-size:15px;margin:12px 0 6px");
          const section = add("section", cards); section.className = "cx-print-card"; section.setAttribute("data-cx-print-record", "");
          const heading = add("div", section); heading.className = "cx-print-card-heading";
          const list = add("dl", section);
          for (const [index, column] of columns.entries()) {
            const role = cardRoles?.[index] || (index ? "field" : "title");
            if (role === "title") value(add("h2", heading), cell(row, column));
            else if (role === "pill") {
              const status = add("span", heading); status.className = "cx-print-card-status";
              status.setAttribute("aria-label", column.title); value(status, cell(row, column));
            } else if (role === "footer") {
              const footer = add("footer", section); add("span", footer, column.title); value(add("span", footer), cell(row, column));
            } else {
              const field = add("div", list); if (role === "wide") field.className = "cx-print-card-wide";
              add("dt", field, column.title); value(add("dd", field), cell(row, column));
            }
          }
          if (!list.childNodes.length) list.remove();
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
          add("th", header, column.title, cellStyle + ";overflow-wrap:normal;background:var(--hfx-color-surface-sunken);font-weight:var(--hfx-weight-semibold);white-space:nowrap" + (column.kind === "number" ? ";text-align:right" : ""));
        }
        const body = add("tbody", table);
        const summary = (parent, values, label, subtotal) => {
          if (!values || !grouping?.aggregates.length) return;
          const tr = add("tr", parent); tr.setAttribute(subtotal ? "data-cx-print-subtotal" : "data-cx-print-total", "");
          for (const [index, column] of columns.entries()) {
            const summaries = grouping.aggregates.filter(aggregate => aggregate.column === column.id),
              td = add("td", tr, summaries.length ? undefined : index === 0 ? label : "", cellStyle + ";font-weight:var(--hfx-weight-semibold);background:var(--hfx-color-surface-sunken)" +
                (column.kind === "number" ? ";text-align:right" : ""));
            for (const aggregate of summaries) {
              const pair = add("div", td);
              add("span", pair, (aggregate.label || aggregate.operation) + ": ", "display:block;color:var(--hfx-color-text-muted);font-size:9px;font-weight:var(--hfx-weight-regular)");
              add("span", pair, cellText(values[aggregate.id], column, fmt), "display:block;white-space:nowrap");
            }
          }
        };
        for (const [index, row] of snapshot.rows.entries()) {
          for (const heading of starts.get(index) || []) {
            const group = add("tr", body), title = add("th", group, heading.text, cellStyle + ";background:var(--hfx-color-surface-sunken)");
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
