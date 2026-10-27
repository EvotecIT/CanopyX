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

  /** Host-owned cell commands projected through the shared menu item model. */
  function crMenuItems(grid) {
    const labels = grid.labels, items = [
      { id: "copy", label: labels.gridCopyCells, icon: "copy", run: () => grid.copyCellRanges({ headers: false }) },
      { id: "copy-headers", label: labels.gridCopyCellsWithHeaders, run: () => grid.copyCellRanges({ headers: true }) }
    ];
    if (grid.cellOptions.paste) items.push({ id: "paste", label: labels.gridPasteCells,
      disabled: typeof global.navigator.clipboard?.readText !== "function",
      run: () => global.navigator.clipboard.readText().then(text => crPaste(grid, text, null, "clipboard")) });
    items.push({ id: "selection-separator", kind: "separator" },
      { id: "select-all", label: labels.gridSelectAllCells, run: () => grid.selectAllCells() },
      { id: "clear", label: labels.gridClearCellRanges, icon: "close", disabled: !grid.cellRanges.length, run: () => grid.clearCellRanges() });
    return items;
  }

  // The range gesture owns its 500ms timer; the binding owns rendering, dismissal and the touch sheet.
  function crMenu(grid, cell, event) {
    const hit = crHit(grid, cell);
    if (!hit || grid.destroyed) return;
    hit.record = hit.element._w;
    Promise.resolve(grid.cellMenuBinding.open(event, cell, { touch: true, hit }))
      .catch(error => { if (!grid.destroyed) grid.emit("error", { error }); });
  }
