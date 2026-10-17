  // ---------- ranges by pointer: drag, Shift+click, Ctrl/Cmd+click and drag ----------
  // A press on a body cell starts at that cell; dragging extends the range, scrolling the grid near its edges. A plain click
  // only moves the anchor (and focus into the cell), so ordinary clicks never show a range. Shift+click spans from the
  // anchor; Ctrl or Cmd adds a range when several are allowed. Links, buttons and other controls in cells keep their clicks.
  const CR_CONTROLS = "a[href],button,input,select,textarea,summary,label,[contenteditable]:not([contenteditable=false]),[role=button],[role=checkbox],.cx-hidden-fields";

  /** The cell under a viewport point, clamped into the rows on screen, so a drag past an edge keeps extending. */
  function crHitAt(grid, x, y) {
    const frame = grid.grid.getBoundingClientRect(), top = frame.top + grid.head.offsetHeight, left = frame.left + grid.grid.clientLeft;
    const px = Math.max(left + 1, Math.min(x, left + grid.grid.clientWidth - 2)), py = Math.max(top + 1, Math.min(y, frame.top + grid.grid.clientHeight - 2));
    for (const element of document.elementsFromPoint(px, py)) {
      if (element.classList.contains("cx-range-handle") || element.classList.contains("cx-fill-handle")) continue;
      const hit = crHit(grid, element);
      if (hit) return hit;
      if (element === grid.grid) break;
    }
    return null;
  }

  /**
   * Follows one pointer over the cells until it is released: calls update with each new cell and, once the pointer has moved,
   * scrolls near the edges (a press that stays put never scrolls, wherever it lands).
   */
  function crTrack(grid, event, update, done) {
    const pointer = event.pointerId, x0 = event.clientX, y0 = event.clientY;
    let x = x0, y = y0, frame = 0, last = null, moved = false;
    const step = () => {
      frame = requestAnimationFrame(step);
      if (!moved) return;
      const box = grid.grid.getBoundingClientRect(), top = box.top + grid.head.offsetHeight;
      const dy = y < top + 24 ? -Math.ceil((top + 24 - y) / 2) : y > box.bottom - 24 ? Math.ceil((y - box.bottom + 24) / 2) : 0;
      const dx = x < box.left + 24 ? -12 : x > box.right - 24 ? 12 : 0;
      if (dy) grid.setLogicalTop(Math.max(0, grid.logicalTop() + Math.min(40, Math.max(-40, dy))));
      if (dx) grid.grid.scrollLeft += dx;
      if (dx || dy) { grid.render(); look(); }
    };
    const look = () => { const hit = crHitAt(grid, x, y); if (hit && (!last || hit.row !== last.row || hit.column !== last.column)) { last = hit; update(hit); } };
    const move = ev => {
      if (ev.pointerId !== pointer) return;
      x = ev.clientX; y = ev.clientY;
      if (!moved && Math.hypot(x - x0, y - y0) < 4) return;
      moved = true; look();
    };
    const stop = ev => {
      if (ev && ev.pointerId !== undefined && ev.pointerId !== pointer) return;
      cancelAnimationFrame(frame);
      global.removeEventListener("pointermove", move); global.removeEventListener("pointerup", stop); global.removeEventListener("pointercancel", stop);
      grid.lifetime.signal.removeEventListener("abort", stop);
      if (grid.cellDrag === stop) grid.cellDrag = null;
      done(ev?.type === "pointerup");
    };
    grid.cellDrag?.(); grid.cellDrag = stop;
    global.addEventListener("pointermove", move); global.addEventListener("pointerup", stop); global.addEventListener("pointercancel", stop);
    grid.lifetime.signal.addEventListener("abort", stop, { once: true });
    frame = requestAnimationFrame(step);
  }

  // The next click after a drag or a long press ends the gesture; it does not activate the row as well.
  function crSwallowClick(grid) {
    const swallow = event => { event.preventDefault(); event.stopPropagation(); };
    grid.grid.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => grid.grid.removeEventListener("click", swallow, { capture: true }), 400);
  }

  function crPointerDown(grid, event) {
    if (!grid.cellOptions.enabled || event.target.closest(".cx-range-handle,.cx-fill-handle")) return;
    if (event.pointerType === "touch") { crTouchStart(grid, event); return; }
    const hit = crHit(grid, event.target);
    if (event.button !== 0 || !hit || event.target.closest(CR_CONTROLS)) return;
    event.preventDefault();
    grid.cellHandles = false;
    const additive = (event.ctrlKey || event.metaKey) && grid.cellOptions.multiple, at = { row: hit.row, column: hit.column };
    const before = JSON.stringify(grid.cellRanges);
    let range;
    if (event.shiftKey && grid.cellAnchor) {
      range = { anchor: grid.cellAnchor, end: at };
      grid.cellRanges = additive ? [...grid.cellRanges.slice(0, -1), range] : [range];
    } else {
      grid.cellAnchor = at; range = { anchor: at, end: at };
      grid.cellRanges = additive ? [...grid.cellRanges, range] : [];
      if (additive) grid.cellRanges = grid.cellRanges.slice(0, 1000);
    }
    crPaint(grid);
    let dragged = false;
    crTrack(grid, event, next => {
      if (next.row === range.anchor.row && next.column === range.anchor.column && !grid.cellRanges.includes(range)) return;
      range.end = { row: next.row, column: next.column }; dragged = true;
      if (!grid.cellRanges.includes(range)) grid.cellRanges = [...grid.cellRanges, range];
      crPaint(grid);
    }, () => {
      // Neither a drag nor a Shift or Ctrl/Cmd click also activates or selects the row underneath.
      if (dragged || event.shiftKey || event.ctrlKey || event.metaKey) crSwallowClick(grid);
      if (JSON.stringify(grid.cellRanges) !== before || event.shiftKey || additive) crChanged(grid);
      grid.cellFocusAfterClick = !dragged && !event.shiftKey && !additive ? hit : null;
      if (dragged || event.shiftKey || additive) crFocus(grid, grid.cellAnchor);
    });
  }

  /** Puts keyboard focus on a cell (the anchor), so Shift+arrows and the clipboard keys continue from it. */
  function crFocus(grid, at) {
    if (!at) return;
    const row = crRows(grid).rowItem(at.row), index = grid.cols.findIndex(column => column.id === at.column);
    if (row && !row.status && index >= 0 && grid.rendered.get(row)) grid.focusCell(row, index, null);
  }
