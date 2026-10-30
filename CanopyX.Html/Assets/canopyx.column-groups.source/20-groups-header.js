  // ---------- group header rows above the column headers ----------
  // One header row per group level, above the row of column headers, inside the sticky header. A group's cell spans its
  // visible columns (aria-colspan), takes their widths and their pin, and shrinks or disappears with them. A column outside
  // a group, or in a shallower group, has an empty spacer cell in the rows above it, hidden from assistive technology, so its
  // own header stays in the bottom row with the others.
  function cgHeader(grid) {
    const model = grid.columnGroupModel, cols = grid.cols, paths = cols.map(column => cgPath(model, column.id));
    const depth = Math.max(0, ...paths.map(path => path.length));
    for (const row of grid.groupRows || []) row.remove();
    grid.groupRows = []; grid.groupCells = [];
    for (let level = 0; level < depth; level++) {
      const row = h("div", "cx-hrow cx-hgroup-row");
      row.setAttribute("role", "row"); row.setAttribute("aria-rowindex", String(level + 1));
      for (let first = 0; first < cols.length;) {
        const node = paths[first][level];
        let end = first + 1;
        if (node) while (end < cols.length && paths[end][level] === node && cols[end].effectivePin === cols[first].effectivePin) end++;
        const cell = node ? cgGroupCell(grid, node, first, end - first) : h("div", "cx-hcell cx-hgroup-pad");
        if (!node) cell.setAttribute("aria-hidden", "true");
        cell._cxSpan = { first, last: end - 1 };
        row.appendChild(cell); grid.groupCells.push(cell); first = end;
      }
      grid.groupRows.push(row);
    }
    grid.head.prepend(...grid.groupRows);
    grid.headRow.setAttribute("aria-rowindex", String(depth + 1));
    grid.host.classList.toggle("cx-column-groups", depth > 0);
    cgDepth(grid, depth);
    cgLayout(grid);
    grid.columnBandKey = cgBandKey(grid);
  }

  function cgGroupCell(grid, node, first, span) {
    const cell = h("div", "cx-hcell cx-hgroup"), title = h("span", "cx-hgroup-title");
    cell.setAttribute("role", "columnheader"); cell.setAttribute("aria-colindex", String(first + 1));
    cell.setAttribute("aria-colspan", String(span)); cell.setAttribute("aria-label", node.title); cell.dataset.cxGroup = node.id; cell.dataset.cxLevel = String(node.depth);
    setText(title, node.title); title.title = node.title; cell.appendChild(title);
    if (grid.view.columnGroupMode !== "presentation") {
      if (grid.view.reporting?.columnReorder) cgMoveButton(grid, node, cell);
      cell.appendChild(cgGrip(grid, node));
    }
    return cell;
  }

  // The header now has depth more rows above the column headers: the row count and every row's index follow.
  function cgDepth(grid, depth) {
    const previous = grid.headDepth || 0;
    if (previous === depth) return;
    grid.headDepth = depth;
    const count = grid.grid.getAttribute("aria-rowcount");
    if (count && count !== "-1") grid.grid.setAttribute("aria-rowcount", String(Number(count) - previous + depth));
    for (const row of [...grid.rendered.values(), ...grid.pool]) row._index = undefined;
    grid.scheduleRender();
  }

  // Group cells take the widths and the pins the column headers below them have after every layout.
  function cgLayout(grid) {
    const cells = grid.headCells || [], widths = cells.map(cell => parseFloat(cell.style.width) || 0);
    for (const row of grid.groupRows || []) row.style.width = grid.headRow.style.width;
    for (const cell of grid.groupCells || []) {
      const { first, last } = cell._cxSpan;
      if (last >= cells.length) continue;
      let width = 0;
      for (let index = first; index <= last; index++) width += widths[index];
      const head = cells[first], tail = cells[last], pin = head.dataset.cxPin;
      cell.style.width = width + "px";
      if (pin) cell.dataset.cxPin = pin; else cell.removeAttribute("data-cx-pin");
      cell.style.left = pin === "left" ? head.style.left : ""; cell.style.right = pin === "right" ? tail.style.right : "";
      cell.classList.toggle("cx-pin-edge", cells.slice(first, last + 1).some(item => item.classList.contains("cx-pin-edge")));
      const grip = cell.querySelector(":scope > .cx-resize"), columns = grid.cols.slice(first, last + 1);
      if (grip) {
        grip.setAttribute("aria-valuemin", String(columns.reduce((sum, column) => sum + column.minW, 0)));
        grip.setAttribute("aria-valuemax", String(Math.min(2147483647, columns.reduce((sum, column) => sum + column.maxW, 0))));
        grip.setAttribute("aria-valuenow", String(Math.round(width))); grip.setAttribute("aria-valuetext", fill(grid.labels.columnWidth, { width: numberFormat(grid.lang).format(Math.round(width)) }));
      }
    }
    grid.host.style.setProperty("--cx-pin-left-w", (grid.pinnedLeftWidth || 0) + "px");
  }

  /**
   * A top-level group whose columns the pin budget split (some pinned, the rest scrolling) scrolls as a whole instead: the
   * pins of the other columns keep their offsets, recomputed without the group, and the requested pins stay as they were.
   */
  function cgUnsplit(grid) {
    const model = grid.columnGroupModel, shown = new Set(grid.cols), byId = new Map(grid.columns.map(column => [column.id, column]));
    const split = model.roots.map(root => root.leaves.map(id => byId.get(id)).filter(column => shown.has(column)))
      .filter(members => new Set(members.map(column => column.effectivePin || "none")).size > 1);
    if (!split.length) return;
    for (const members of split) for (const column of members) column.effectivePin = "none";
    const width = column => column.renderWidth ?? column.width;
    let start = 0, end = 0;
    for (const column of grid.cols) { column.pinOffset = column.effectivePin === "left" ? start : 0; if (column.effectivePin === "left") start += width(column); }
    for (const column of [...grid.cols].reverse()) if (column.effectivePin === "right") { column.pinOffset = end; end += width(column); }
    grid.pinnedLeftWidth = start; grid.pinnedRightWidth = end; grid.host.classList.toggle("cx-pins", start + end > 0);
    grid.cols.forEach((column, index) => grid.applyColumnPin(grid.headCells[index], column));
    for (const row of [...grid.rendered.values(), ...grid.pool])
      if (row._kind === "node") grid.cols.forEach((column, index) => { if (row.children[index]) grid.applyColumnPin(row.children[index], column); });
    grid.syncPinnedShadows();
  }
