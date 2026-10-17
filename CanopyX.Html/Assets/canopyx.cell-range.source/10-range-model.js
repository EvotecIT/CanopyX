  // ---------- cell ranges: settings, the ranges themselves and how they are drawn (docs/cell-ranges.md) ----------
  // A range is two corners, each a row position in the shown order and a column id; it covers the rectangle between them
  // in the current column order. Ranges are cells, not rows: row selection (checkboxes, Space) stays as it was. A new query
  // (search, filters, sorting, paging) clears them, since row positions then mean other rows.
  const CR_LIMIT = 200000;
  const crBad = problem => { throw new Error("CanopyX: " + problem + "."); };

  /** The grid's range and clipboard settings: the host's options over the view's. */
  function crOptions(grid) {
    const declared = grid.opts.rangeSelection ?? grid.view.rangeSelection, clipboard = Object.assign({}, grid.view.clipboard, grid.opts.clipboard);
    const object = declared !== null && typeof declared === "object" && !Array.isArray(declared), range = object ? declared : {};
    const flag = value => value === undefined || typeof value === "boolean";
    if (declared !== undefined && typeof declared !== "boolean" && !object || !flag(range.enabled) || !flag(range.multiple) || !flag(range.fillHandle) ||
        !flag(clipboard.copyHeaders) || !flag(clipboard.paste) || clipboard.copyValues !== undefined && !["display", "raw"].includes(clipboard.copyValues))
      crBad("rangeSelection takes true or { enabled, multiple, fillHandle }, and clipboard { copyHeaders, copyValues, paste }");
    return Object.freeze({ enabled: declared === true || object && range.enabled !== false, multiple: range.multiple !== false,
      fillHandle: !!range.fillHandle, headers: !!clipboard.copyHeaders, values: clipboard.copyValues || "display", paste: clipboard.paste !== false });
  }
  // The rows in their shown order: the grouped projection of the reporting runtime, or the grid itself.
  const crRows = grid => grid.rowProjection || grid;
  function crBounds(grid) {
    if (grid.rowProjection) return { first: 0, last: grid.rowProjection.rowCount() - 1 };
    const bounds = grid.rowBounds();
    return { first: Math.max(0, bounds.first), last: bounds.last };
  }
  // Positions stay in the shown order, but headings and expanded details are not selectable data cells.
  // The projection's record intervals count large ranges without visiting every record.
  function crDataBounds(grid, top, bottom) {
    const projection = grid.rowProjection;
    if (!projection) return { first: top, count: Math.max(0, bottom - top + 1) };
    let first = -1, count = 0;
    for (const range of projection.recordWindow(top, bottom).ranges) {
      const start = range.first + (projection.recordIndex(range.first) < top ? 1 : 0);
      const end = range.last - (projection.recordIndex(range.last) > bottom ? 1 : 0);
      if (start > end) continue;
      if (first < 0) first = projection.recordIndex(start);
      count += end - start + 1;
    }
    return { first, count };
  }

  /** A range as row and column positions (top, bottom, left, right), or null when one of its columns is out of view. */
  function crRect(grid, range) {
    const left = grid.cols.findIndex(column => column.id === range.anchor.column), right = grid.cols.findIndex(column => column.id === range.end.column);
    if (left < 0 || right < 0) return null;
    return { top: Math.min(range.anchor.row, range.end.row), bottom: Math.max(range.anchor.row, range.end.row), left: Math.min(left, right), right: Math.max(left, right) };
  }
  const crIndex = (grid, id) => grid.cols.findIndex(column => column.id === id);
  const crRects = grid => grid.cellRanges.map(range => crRect(grid, range)).filter(Boolean);

  // The cell a pointer or focus is in: its row position, column id and element, or null outside the body cells.
  function crHit(grid, target) {
    const cell = target?.closest?.(".cx-cell"), row = cell?.parentElement;
    if (!row || row._kind !== "node" || !row._w || row._index === undefined || !grid.canvas.contains(row)) return null;
    const index = row._cells.findIndex(slot => slot.cell === cell), column = grid.cols[index];
    return column ? { row: row._index, column: column.id, cell, element: row } : null;
  }

  /**
   * Marks the cells of every range in the rendered rows: a tint, the outline on the range's outer edges and aria-selected.
   * Runs after every render pass, so rows that scroll into view or are reused for other rows show the right cells.
   */
  function crPaint(grid) {
    for (const cell of grid.cellPainted || []) {
      cell.classList.remove("cx-range", "cx-range-t", "cx-range-b", "cx-range-l", "cx-range-r", "cx-range-fill");
      cell.removeAttribute("aria-selected");
    }
    grid.cellPainted = [];
    const rects = crRects(grid), fill = grid.cellFillPreview;
    if (!rects.length && !fill) { crHandles(grid, {}); return; }
    let corner = null, start = null;
    const last = rects[rects.length - 1];
    for (const row of grid.rendered.values()) {
      if (row._kind !== "node" || row._index === undefined) continue;
      const index = row._index, cells = row._cells;
      for (const rect of rects) {
        if (index < rect.top || index > rect.bottom) continue;
        for (let column = rect.left; column <= rect.right && column < cells.length; column++) {
          const cell = cells[column].cell;
          cell.classList.add("cx-range");
          if (index === rect.top) cell.classList.add("cx-range-t");
          if (index === rect.bottom) cell.classList.add("cx-range-b");
          if (column === rect.left) cell.classList.add("cx-range-l");
          if (column === rect.right) cell.classList.add("cx-range-r");
          cell.setAttribute("aria-selected", "true"); grid.cellPainted.push(cell);
        }
      }
      if (fill && index >= fill.top && index <= fill.bottom)
        for (let column = fill.left; column <= fill.right && column < cells.length; column++) { cells[column].cell.classList.add("cx-range-fill"); grid.cellPainted.push(cells[column].cell); }
      if (last && index === last.bottom && cells[last.right]) corner = cells[last.right].cell;
      if (last && index === last.top && cells[last.left]) start = cells[last.left].cell;
    }
    // Touch selections get a handle on two corners; the fill handle sits on the bottom-right corner of a single range.
    crHandles(grid, { start: grid.cellHandles && start, end: grid.cellHandles && corner,
      fill: grid.cellOptions.fillHandle && rects.length === 1 && !fill && !grid.cellHandles && corner });
  }

  // The handles are made once per grid and move to the cells that show them, so repaints never replace the element a
  // pointer holds.
  function crHandles(grid, places) {
    const make = className => { const node = h("span", className); node.setAttribute("aria-hidden", "true"); return node; };
    grid.cellHandleNodes ||= { start: make("cx-range-handle cx-range-handle-start"), end: make("cx-range-handle cx-range-handle-end"),
      fill: Object.assign(make("cx-fill-handle"), { title: grid.labels.gridFillHandle }) };
    for (const [name, node] of Object.entries(grid.cellHandleNodes)) {
      node.dataset.cxCorner = name;
      const cell = places[name];
      if (!cell) node.remove();
      else if (node.parentNode !== cell) cell.appendChild(node);
    }
  }

  /** Says what is selected: one range's rows and columns, or several ranges and their cells. */
  function crAnnounce(grid) {
    const rects = crRects(grid), count = value => numberFormat(grid.lang).format(value);
    const rows = rect => crDataBounds(grid, rect.top, rect.bottom).count, size = rect => rows(rect) * (rect.right - rect.left + 1);
    const text = !rects.length ? grid.cellAnnounced ? grid.labels.gridCellRangeCleared : "" : rects.length === 1 ?
      fill(grid.labels.gridCellRangeSelected, { rows: count(rows(rects[0])), columns: count(rects[0].right - rects[0].left + 1) }) :
      fill(grid.labels.gridCellRangesSelected, { ranges: count(rects.length), cells: count(rects.reduce((sum, rect) => sum + size(rect), 0)) });
    grid.cellAnnounced = rects.length > 0;
    if (text) setText(grid.live, text);
  }

  /** Repaints, announces and raises cellRangeChange once the ranges changed. */
  function crChanged(grid, announce = true) {
    crPaint(grid);
    if (announce) crAnnounce(grid);
    grid.emit("cellRangeChange", { ranges: grid.getCellRanges() });
  }

  /** Scrolls a row position and a column into view without moving focus. */
  function crReveal(grid, row, column) {
    const rows = crRows(grid), item = rows.rowItem(row);
    if (item) { grid.revealGridRow(item, row, rows); grid.render(); }
    const index = grid.cols.findIndex(item => item.id === column), cell = index >= 0 && grid.headCells[index];
    if (!cell || cell.dataset.cxPin) return;
    const left = cell.offsetLeft, right = left + cell.offsetWidth, view = grid.grid, start = view.scrollLeft + (grid.pinnedLeftWidth || 0),
      end = view.scrollLeft + view.clientWidth - (grid.pinnedRightWidth || 0);
    if (left < start) view.scrollLeft -= start - left;
    else if (right > end) view.scrollLeft += right - end;
  }
