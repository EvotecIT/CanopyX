  // ---------- copying ranges: tab-separated text with a typed table beside it ----------
  // The clipboard gets two forms of the same cells. Plain text is tab-separated values, one line per row, with the shown
  // text (copyValues "display") or raw values (numbers with a dot, dates as yyyy-MM-dd HH:mm:ss in the grid's time zone);
  // fields with tabs, line breaks or quotes are quoted, and text that would start a spreadsheet formula gets an apostrophe,
  // as the CSV export does. An HTML table carries the cell types, which spreadsheet applications read first: numbers keep
  // their values, dates are written so they read as dates, and text stays text. Headers (copyHeaders) add the column titles,
  // with the group rows above them when the grid has column groups.
  const crPad = value => String(value).padStart(2, "0");
  function crDate(value, local) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    const part = name => local ? date["get" + name]() : date["getUTC" + name]();
    return part("FullYear") + "-" + crPad(part("Month") + 1) + "-" + crPad(part("Date")) + " " + crPad(part("Hours")) + ":" + crPad(part("Minutes")) + ":" + crPad(part("Seconds"));
  }
  // typed marks the formatted text of a number or date cell, which needs no protection against formulas.
  function crField(value, typed) {
    return gridExportField(value, "\t", typed);
  }
  const crHtml = text => String(text).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  /** One cell as plain text and as a typed table cell. */
  function crCell(grid, row, column, values) {
    const cell = row.h.cells[column.id], value = cellValue(cell), shown = cellText(cell, column, grid.fmt);
    if (value == null || value === "") return { text: values === "raw" ? "" : shown, html: "<td>" + crHtml(values === "raw" ? "" : shown) + "</td>" };
    if (column.kind === "number" && typeof value === "number")
      return { typed: true, text: values === "raw" ? value : shown, html: '<td x:num="' + value + "\" data-sheets-value='{\"1\":3,\"3\":" + value + "}' style=\"mso-number-format:General\">" + crHtml(values === "raw" ? String(value) : shown) + "</td>" };
    if (column.kind === "datetime") {
      const text = crDate(value, grid.local);
      return { typed: true, text: values === "raw" ? text : shown, html: '<td style="mso-number-format:\'yyyy\\-mm\\-dd\\ hh\\:mm\\:ss\'">' + crHtml(text) + "</td>" };
    }
    if (typeof value === "boolean") return { text: values === "raw" ? (value ? "TRUE" : "FALSE") : shown, html: '<td x:bool="' + (value ? "TRUE" : "FALSE") + '">' + crHtml(value ? "TRUE" : "FALSE") + "</td>" };
    const text = values === "raw" ? String(value) : shown;
    return { text, html: "<td data-sheets-value='" + crHtml(JSON.stringify({ 1: 2, 2: text })) + "' style=\"mso-number-format:'\\@'\">" + crHtml(text) + "</td>" };
  }

  /**
   * The blocks to copy: one block when every range has the same columns (their rows in order, each once), otherwise one
   * block per range, in reading order. Each block lists row positions and column positions.
   */
  function crBlocks(grid, rects) {
    if (!rects.length) return [];
    if (rects.every(rect => rect.left === rects[0].left && rect.right === rects[0].right)) {
      const rows = new Set();
      for (const rect of [...rects].sort((a, b) => a.top - b.top)) for (let row = rect.top; row <= rect.bottom; row++) rows.add(row);
      return [{ rows: [...rows].sort((a, b) => a - b), left: rects[0].left, right: rects[0].right }];
    }
    return [...rects].sort((a, b) => a.top - b.top || a.left - b.left).map(rect =>
      ({ rows: Array.from({ length: rect.bottom - rect.top + 1 }, (_, index) => rect.top + index), left: rect.left, right: rect.right }));
  }

  function crCount(blocks) {
    let cells = 0;
    for (const block of blocks) cells += block.rows.length * (block.right - block.left + 1);
    if (cells > CR_LIMIT) crBad("a copy or paste covers at most " + CR_LIMIT + " cells");
  }
  /** The loaded rows of the blocks by position, or null while one of them is still loading. */
  function crLoaded(grid, blocks) {
    const rows = crRows(grid), loaded = new Map();
    crCount(blocks);
    for (const block of blocks) for (const position of block.rows) {
      const row = rows.rowItem(position);
      if (row?.status === "loading") return null;
      if (row?.status === "error") crBad("a row of the range could not be loaded");
      if (row && !row.status) loaded.set(position, row);
    }
    return loaded;
  }
  /** The rows of the blocks by position, loading the pages that are not in the cache first. */
  async function crLoad(grid, blocks) {
    const rows = crRows(grid), epoch = grid.queryEpoch, loaded = new Map();
    crCount(blocks);
    for (const block of blocks) for (const position of block.rows) {
      let row = rows.rowItem(position);
      if (row?.status === "loading") row = await grid.waitForRow(row._ri, epoch);
      if (row?.status === "error") crBad("a row of the range could not be loaded");
      if (row && !row.status) loaded.set(position, row);
    }
    if (epoch !== grid.queryEpoch) throw new DOMException("The ranges changed while their rows loaded.", "AbortError");
    return loaded;
  }
  /** The header lines of a block: group rows (with column groups) and the column titles. */
  function crHeaders(grid, columns) {
    const lines = [], model = grid.columnGroupModel, paths = model?.roots.length ? columns.map(column => cgPathOf(model, column.id)) : [];
    const depth = Math.max(0, ...paths.map(path => path.length));
    for (let level = 0; level < depth; level++) {
      const texts = [], cells = [];
      for (let index = 0; index < columns.length;) {
        const node = paths[index][level];
        let end = index + 1;
        if (node) while (end < columns.length && paths[end][level] === node) end++;
        for (let at = index; at < end; at++) texts.push(node && at === index ? crField(node.title) : "");
        cells.push(node ? '<th colspan="' + (end - index) + '">' + crHtml(node.title) + "</th>" : "<th></th>".repeat(end - index));
        index = end;
      }
      lines.push({ text: texts.join("\t"), html: "<tr>" + cells.join("") + "</tr>" });
    }
    lines.push({ text: columns.map(column => crField(column.title)).join("\t"), html: "<tr>" + columns.map(column => "<th>" + crHtml(column.title) + "</th>").join("") + "</tr>" });
    return lines;
  }
  // The groups above a column, read from the column groups part's model when it is on the page.
  function cgPathOf(model, id) {
    const path = [];
    for (let node = model.owner.get(id); node; node = node.parent) path.unshift(node);
    return path;
  }

  /** The text and table of the ranges (or of the focused cell when there is none), with the counts copied. */
  function crContent(grid, blocks, loaded, options) {
    const values = options.values ?? grid.cellOptions.values, headers = options.headers ?? grid.cellOptions.headers, texts = [], tables = [];
    let rowCount = 0, columnCount = 0;
    for (const block of blocks) {
      const columns = grid.cols.slice(block.left, block.right + 1), lines = headers ? crHeaders(grid, columns) : [];
      for (const position of block.rows) {
        const row = loaded.get(position);
        if (!row) continue;
        const cells = columns.map(column => crCell(grid, row, column, values));
        lines.push({ text: cells.map(cell => crField(cell.text, cell.typed)).join("\t"), html: "<tr>" + cells.map(cell => cell.html).join("") + "</tr>" });
        rowCount++;
      }
      columnCount = Math.max(columnCount, columns.length);
      texts.push(lines.map(line => line.text).join("\r\n"));
      tables.push("<table>" + lines.map(line => line.html).join("") + "</table>");
    }
    return { text: texts.join("\r\n\r\n") + "\r\n", html: "<meta charset=\"utf-8\">" + tables.join("<br>"), rows: rowCount, columns: columnCount };
  }

  // The ranges to copy; without any, the focused cell, or the focused row's visible cells when focus is on the row itself.
  function crCopyRects(grid) {
    const rects = crRects(grid);
    if (rects.length) return rects;
    const hit = crHit(grid, document.activeElement), focused = grid.focused, rows = crRows(grid);
    const position = hit ? hit.row : focused ? rows.indexOf(focused) : -1, column = hit ? grid.cols.findIndex(item => item.id === hit.column) : 0;
    return position >= 0 && column >= 0 ? [{ top: position, bottom: position, left: column, right: hit ? column : grid.cols.length - 1 }] : [];
  }

  /** Writes both forms with the asynchronous clipboard, or the text alone where only that is available. */
  async function crWrite(grid, content) {
    const clipboard = global.navigator.clipboard;
    if (typeof global.ClipboardItem === "function" && typeof clipboard?.write === "function") {
      try {
        await clipboard.write([new global.ClipboardItem({ "text/plain": new Blob([content.text], { type: "text/plain" }), "text/html": new Blob([content.html], { type: "text/html" }) })]);
        return;
      } catch (error) { if (error?.name === "AbortError") throw error; }
    }
    if (typeof clipboard?.writeText !== "function") crBad("the clipboard is unavailable");
    await clipboard.writeText(content.text);
  }

  function crCopied(grid, content) { setText(grid.live, fill(grid.labels.gridCellsCopied, { rows: numberFormat(grid.lang).format(content.rows), columns: numberFormat(grid.lang).format(content.columns) })); }

  /**
   * Ctrl/Cmd+C: when every row of the ranges is loaded the copy event writes both forms at once, which needs no clipboard
   * permission; otherwise the rows load first and the asynchronous clipboard writes them.
   */
  function crCopyKey(grid) {
    try {
      const blocks = crBlocks(grid, crCopyRects(grid)), loaded = crLoaded(grid, blocks);
      if (!loaded) { grid.copyCellRanges().catch(error => grid.emit("error", { error })); return; }
      const content = grid.cellCopyPending = crContent(grid, blocks, loaded, {});
      document.execCommand?.("copy");
      const handled = grid.cellCopyPending === null;
      grid.cellCopyPending = null;
      if (!handled) crWrite(grid, content).then(() => crCopied(grid, content)).catch(error => grid.emit("error", { error }));
    } catch (error) { grid.cellCopyPending = null; grid.emit("error", { error }); }
  }

  // The copy event of Ctrl/Cmd+C (and of the browser's Copy command while focus is in the grid) writes the prepared cells.
  function crCopyEvent(grid, event) {
    let content = grid.cellCopyPending;
    if (!content && grid.cellRanges.length && grid.canvas.contains(document.activeElement) && !String(global.getSelection() || "")) {
      const blocks = crBlocks(grid, crRects(grid)), loaded = crLoaded(grid, blocks);
      if (loaded) content = crContent(grid, blocks, loaded, {});
    }
    if (!content || !event.clipboardData) return;
    event.clipboardData.setData("text/plain", content.text); event.clipboardData.setData("text/html", content.html);
    event.preventDefault(); grid.cellCopyPending = null; crCopied(grid, content);
  }
