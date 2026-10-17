  // ---------- ranges by touch: long-press, then drag, then adjust with the corner handles ----------
  // A finger that rests on a cell for half a second starts a range there; moving it without lifting extends the range, and
  // the page does not scroll meanwhile. Once lifted, two round handles on the range's corners resize it. A long press inside
  // a range opens the cell menu instead. A plain tap clears the ranges and keeps the row's own tap behaviour.
  const CR_PRESS_MS = 500;

  function crTouchStart(grid, event) {
    const hit = crHit(grid, event.target);
    if (!hit || event.target.closest(CR_CONTROLS)) return;
    const pointer = event.pointerId, x0 = event.clientX, y0 = event.clientY;
    crGuard(grid, true);
    const quit = pressed => {
      clearTimeout(timer); grid.lifetime.signal.removeEventListener("abort", quit);
      global.removeEventListener("pointermove", watch); global.removeEventListener("pointerup", lift); global.removeEventListener("pointercancel", quit);
      if (pressed !== true) crGuard(grid, false);
    };
    const watch = ev => { if (ev.pointerId === pointer && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) quit(); };
    const lift = ev => {
      if (ev.pointerId !== pointer) return;
      quit();
      if (grid.cellRanges.length) { grid.cellRanges = []; grid.cellHandles = false; crChanged(grid); }
    };
    const timer = setTimeout(() => {
      quit(true);
      if (grid.destroyed) return;
      const inside = crRects(grid).some(rect => hit.row >= rect.top && hit.row <= rect.bottom && crIndex(grid, hit.column) >= rect.left && crIndex(grid, hit.column) <= rect.right);
      crSwallowClick(grid);
      if (inside) { crGuard(grid, false); crMenu(grid, hit.cell); return; }
      const at = { row: hit.row, column: hit.column }, range = { anchor: at, end: at };
      grid.cellAnchor = at; grid.cellRanges = [range]; grid.cellHandles = true; crTouching(grid, true);
      crChanged(grid, false);
      crTrack(grid, event, next => { range.end = { row: next.row, column: next.column }; crPaint(grid); }, () => { crTouching(grid, false); crChanged(grid); });
    }, CR_PRESS_MS);
    grid.lifetime.signal.addEventListener("abort", quit, { once: true });
    global.addEventListener("pointermove", watch); global.addEventListener("pointerup", lift); global.addEventListener("pointercancel", quit);
  }

  // While a finger extends a range the grid keeps the page from scrolling. The blocking listener exists only from the press
  // on a cell to the end of that gesture, so ordinary touch scrolling elsewhere and afterwards stays passive.
  function crTouching(grid, on) {
    grid.cellTouching = on;
    if (!on) crGuard(grid, false);
  }
  function crGuard(grid, on) {
    grid.cellTouchGuard ||= event => { if (grid.cellTouching) event.preventDefault(); };
    if (on) grid.grid.addEventListener("touchmove", grid.cellTouchGuard, { passive: false });
    else grid.grid.removeEventListener("touchmove", grid.cellTouchGuard, { passive: false });
  }

  // A handle drags its corner of the last range; the opposite corner stays.
  function crHandleDown(grid, event) {
    const handle = event.target.closest(".cx-range-handle"), range = grid.cellRanges[grid.cellRanges.length - 1];
    if (!handle || !range) return;
    event.preventDefault(); event.stopPropagation();
    const rect = crRect(grid, range);
    if (!rect) return;
    const corner = handle.dataset.cxCorner === "start";
    range.anchor = { row: corner ? rect.bottom : rect.top, column: grid.cols[corner ? rect.right : rect.left].id };
    range.end = { row: corner ? rect.top : rect.bottom, column: grid.cols[corner ? rect.left : rect.right].id };
    crGuard(grid, true); crTouching(grid, true);
    crTrack(grid, event, next => { range.end = { row: next.row, column: next.column }; crPaint(grid); }, () => { crTouching(grid, false); crChanged(grid); });
  }
