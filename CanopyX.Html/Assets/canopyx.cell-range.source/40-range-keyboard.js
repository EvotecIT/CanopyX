  // ---------- ranges by keyboard, the clipboard keys and the cell menu ----------
  // From a focused cell, Shift+arrows extend a range from that cell (Ctrl/Cmd with them goes to the last row or column),
  // Shift+Page Up/Down by a page and Shift+Home/End to the first or last column. Focus stays on the anchor cell; the range's
  // far corner scrolls into view. Ctrl/Cmd+A selects every cell, Escape clears the ranges, Ctrl/Cmd+C copies them, Ctrl/Cmd+D
  // fills down when the fill handle is on, and the context menu key or Shift+F10 opens the cell menu. Editors keep their keys.
  const CR_STEPS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], PageUp: [-1, 0], PageDown: [1, 0], Home: [0, -1], End: [0, 1] };

  function crKey(grid, event) {
    if (event.defaultPrevented || event.isComposing || event.altKey || !grid.cellOptions.enabled) return;
    const target = event.target, typing = target.closest("input,textarea,select,[contenteditable]:not([contenteditable=false])");
    if (typing || !grid.canvas.contains(target)) return;
    const key = event.key, letter = key.length === 1 ? key.toLowerCase() : "", command = event.ctrlKey || event.metaKey, hit = crHit(grid, target);
    const consume = () => { event.preventDefault(); event.stopPropagation(); };
    if (command && letter === "c" && (grid.cellRanges.length || hit) && !String(global.getSelection() || "")) { consume(); crCopyKey(grid); return; }
    if (command && letter === "a") { consume(); grid.selectAllCells(); return; }
    if (command && letter === "d" && grid.cellOptions.fillHandle && grid.cellRanges.length === 1) { consume(); crFillDown(grid).catch(error => grid.emit("error", { error })); return; }
    if (key === "Escape" && grid.cellRanges.length) { consume(); grid.clearCellRanges(); return; }
    if ((key === "ContextMenu" || key === "F10" && event.shiftKey) && hit) { consume(); crMenu(grid, hit.cell); return; }
    if (!CR_STEPS[key]) return;
    if (!event.shiftKey) { if (grid.cellRanges.length && !command) { grid.cellRanges = []; grid.cellHandles = false; crChanged(grid); } return; }
    if (!hit) return;
    consume();
    let range = grid.cellRanges[grid.cellRanges.length - 1];
    if (!range || range.anchor.row !== hit.row || range.anchor.column !== hit.column) {
      range = { anchor: { row: hit.row, column: hit.column }, end: { row: hit.row, column: hit.column } };
      grid.cellAnchor = range.anchor; grid.cellRanges = [range];
    }
    const bounds = crBounds(grid), [dRow, dColumn] = CR_STEPS[key], last = grid.cols.length - 1;
    let row = range.end.row, column = Math.max(0, grid.cols.findIndex(item => item.id === range.end.column));
    if (key === "PageUp" || key === "PageDown") row = crRows(grid) === grid ? grid.gridPageStep({ _ri: row, hpx: grid.rowH }, dRow) : row + dRow * Math.max(1, Math.floor(grid.viewportHeight / grid.rowH || 10));
    else if (key === "Home" || key === "End") { column = dColumn < 0 ? 0 : last; if (command) row = dColumn < 0 ? bounds.first : bounds.last; }
    else if (command) { if (dRow) row = dRow < 0 ? bounds.first : bounds.last; if (dColumn) column = dColumn < 0 ? 0 : last; }
    else { row += dRow; column += dColumn; }
    range.end = { row: Math.max(bounds.first, Math.min(bounds.last, row)), column: grid.cols[Math.max(0, Math.min(last, column))].id };
    crReveal(grid, range.end.row, range.end.column);
    crChanged(grid);
  }

  /** Opens the cell menu below a cell: copy, copy with headers, paste, select all and clear. */
  function crMenu(grid, cell) {
    loadGridFilterEditor().then(() => {
      if (grid.destroyed || !cell.isConnected) return;
      const labels = grid.labels, panel = grid.openGridPopover(cell, "cx-column-menu cx-cell-menu", labels.gridCellMenu), menu = h("div");
      // Rows recycle their cells for other records: the cell gives back the popover attributes once the menu closes.
      grid.gridPopover.controller.signal.addEventListener("abort", () => queueMicrotask(() => { cell.removeAttribute("aria-controls"); cell.removeAttribute("aria-expanded"); }), { once: true });
      menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", panel.getAttribute("aria-label")); panel.appendChild(menu);
      const add = (label, icon, action, disabled) => {
        const button = gridButton(label, () => { grid.closeGridPopover(); Promise.resolve().then(action).catch(error => grid.emit("error", { error })); });
        const mark = h("span", "ico"); if (icon) mark.appendChild(gridIcon(icon)); button.prepend(mark);
        button.classList.add("cx-mi"); button.setAttribute("role", "menuitem"); button.tabIndex = -1; button.disabled = !!disabled; menu.appendChild(button);
      };
      const copy = headers => grid.copyCellRanges({ headers });
      add(labels.gridCopyCells, "copy", () => copy(false));
      add(labels.gridCopyCellsWithHeaders, null, () => copy(true));
      if (grid.cellOptions.paste) add(labels.gridPasteCells, null, () => global.navigator.clipboard.readText().then(text => crPaste(grid, text, null, "clipboard")),
        typeof global.navigator.clipboard?.readText !== "function");
      menu.appendChild(h("hr", "cx-menu-rule"));
      add(labels.gridSelectAllCells, null, () => grid.selectAllCells());
      add(labels.gridClearCellRanges, "close", () => grid.clearCellRanges(), !grid.cellRanges.length);
      const first = menu.querySelector('[role="menuitem"]:not(:disabled)');
      if (first) { first.tabIndex = 0; first.focus(); }
    }).catch(error => grid.emit("error", { error }));
  }
