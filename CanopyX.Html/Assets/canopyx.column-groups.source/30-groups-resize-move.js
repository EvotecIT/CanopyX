  // ---------- resizing a group and moving it as a whole ----------
  // A group's edge resizes its visible columns together, each in proportion to its width, by pointer or with Left and Right
  // (Shift for larger steps). The columns keep the widths as user widths, as a column's own edge does.
  function cgGrip(grid, node) {
    const grip = h("span", "cx-resize");
    grip.tabIndex = 0; grip.setAttribute("role", "separator"); grip.setAttribute("aria-orientation", "vertical");
    grip.setAttribute("aria-label", fill(grid.labels.resizeColumn, { column: node.title }));
    const members = () => grid.cols.filter(column => node.leaves.includes(column.id));
    // Each key step moves every column of the group by the step a column's own edge takes (10 pixels, 50 with Shift).
    grip.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const columns = members();
      if (event.key === "Home") { for (const column of columns) { grid.fitManual(column); column.width = column.minW; } grid.applyWidths(); }
      else cgResize(grid, columns, (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 50 : 10) * columns.length);
      cgResized(grid, columns);
    });
    grip.addEventListener("pointerdown", event => {
      if (grid.destroyed || event.button !== 0) return;
      if (grid.cancelResize) grid.cancelResize();
      event.preventDefault();
      const columns = members(), widths = columns.map(column => column.renderWidth ?? column.width), x0 = event.clientX, pointer = event.pointerId;
      const move = ev => { if (ev.pointerId === pointer) cgResize(grid, columns, ev.clientX - x0, widths); };
      const stop = () => {
        global.removeEventListener("pointermove", move); global.removeEventListener("pointerup", end);
        global.removeEventListener("pointercancel", end); global.removeEventListener("blur", stop);
        if (grid.cancelResize === stop) grid.cancelResize = null;
        cgResized(grid, columns);
      };
      const end = ev => { if (ev.pointerId === pointer) stop(); };
      grid.cancelResize = stop;
      global.addEventListener("pointermove", move); global.addEventListener("pointerup", end);
      global.addEventListener("pointercancel", end); global.addEventListener("blur", stop);
    });
    return grip;
  }
  function cgResize(grid, columns, delta, from = columns.map(column => column.renderWidth ?? column.width)) {
    const total = from.reduce((sum, width) => sum + width, 0) || 1;
    columns.forEach((column, index) => { grid.fitManual(column); column.width = columnWidth(column, Math.round(from[index] + delta * from[index] / total)); });
    grid.applyWidths();
  }
  function cgResized(grid, columns) {
    grid.noteViewPreferenceIntent?.(); grid.stateChanged();
    for (const column of columns) grid.emit("columnResize", { column: column.id, width: column.width });
  }

  // The members of a parent (or the top-level items) in their current order, as column and group ids.
  function cgSiblings(grid, parent) {
    const model = grid.columnGroupModel, items = parent ? [...parent.columns, ...parent.groups.map(group => group.id)] :
      [...model.roots.map(root => root.id), ...grid.columns.filter(column => !model.owner.has(column.id)).map(column => column.id)];
    const order = grid.columns.map(column => column.id);
    return items.sort((a, b) => order.indexOf(cgFirst(grid, a)) - order.indexOf(cgFirst(grid, b)));
  }

  /** Moves a whole group before or after another member of its parent, keeps focus on its handle and announces its place. */
  function cgMoveGroup(grid, node, targetId, after) {
    const to = cgSibling(grid, node.id, targetId, after);
    if (to.id === node.id) return;
    const order = cgMoved(grid, node.id, to.id, to.after);
    if (!order) return;
    const pin = grid.columns.find(column => column.id === cgFirst(grid, to.id)).pin;
    if (!node.parent) for (const id of node.leaves) grid.columns.find(column => column.id === id).pin = pin;
    grid.setColumnOrder(order);
    const position = cgSiblings(grid, node.parent).indexOf(node.id) + 1;
    const handle = grid.head.querySelector('[data-cx-group="' + CSS.escape(node.id) + '"] .cx-column-move');
    if (handle) (grid.focusReportingHeader ? grid.focusReportingHeader(handle) : handle.focus({ preventScroll: true }));
    if (grid.labels.gridColumnMoved) setText(grid.live, fill(grid.labels.gridColumnMoved, { column: node.title, position }));
  }

  // The move handle of a group (reporting grids with columnReorder): drag it, or press Left or Right.
  function cgMoveButton(grid, node, cell) {
    const move = h("button", "cx-column-move");
    move.type = "button"; setText(move, "⋮⋮");
    move.setAttribute("aria-label", fill(grid.labels.gridMoveColumn, { column: node.title })); move.title = move.getAttribute("aria-label");
    move.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const siblings = cgSiblings(grid, node.parent), target = siblings[siblings.indexOf(node.id) + (event.key === "ArrowLeft" ? -1 : 1)];
      if (target) cgMoveGroup(grid, node, target, event.key === "ArrowRight");
    });
    move.addEventListener("pointerdown", event => cgDragGroup(grid, node, event));
    cell.prepend(move);
  }

  // Pointer moves show where the group would land among its siblings and commit once, at release; Escape cancels.
  function cgDragGroup(grid, node, event) {
    if (grid.destroyed || event.button !== 0) return;
    grid.cancelColumnDrag?.();
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    const pointer = event.pointerId, x0 = event.clientX, y0 = event.clientY;
    let ghost = null, target = null, marked = null;
    const clear = () => { marked?.classList.remove("cx-drop-before", "cx-drop-after"); marked = null; };
    const locate = (x, y) => {
      clear(); target = null;
      const cell = document.elementFromPoint(x, y)?.closest(".cx-hcell");
      if (!cell || !grid.head.contains(cell)) return;
      const span = cell._cxSpan, id = cell.dataset.cxGroup || cell.dataset.cxColumn || span && grid.cols[span.first]?.id;
      if (!id) return;
      const box = cell.getBoundingClientRect(), to = cgSibling(grid, node.id, id, x > box.left + box.width / 2);
      if (to.id === node.id) return;
      target = to;
      const shown = grid.head.querySelector('[data-cx-group="' + CSS.escape(to.id) + '"]') || grid.head.querySelector('.cx-hrow:last-child [data-cx-column="' + CSS.escape(to.id) + '"]');
      if (shown) { marked = shown; shown.classList.add(to.after ? "cx-drop-after" : "cx-drop-before"); }
    };
    const move = ev => {
      if (ev.pointerId !== pointer) return;
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!ghost) {
        ghost = h("div", "cx-column-drag"); ghost.setAttribute("aria-hidden", "true"); setText(ghost, node.title);
        const theme = getComputedStyle(grid.host);
        for (const token of ["surface", "text", "accent", "line"]) ghost.style.setProperty("--cx-" + token, theme.getPropertyValue("--cx-" + token));
        document.body.appendChild(ghost);
      }
      ghost.style.left = ev.clientX + 12 + "px"; ghost.style.top = ev.clientY + 12 + "px"; locate(ev.clientX, ev.clientY);
    };
    const stop = () => {
      global.removeEventListener("pointermove", move); global.removeEventListener("pointerup", end);
      global.removeEventListener("pointercancel", cancel); global.removeEventListener("keydown", key);
      grid.lifetime.signal.removeEventListener("abort", stop);
      ghost?.remove(); clear(); if (grid.cancelColumnDrag === stop) grid.cancelColumnDrag = null;
    };
    const end = ev => { if (ev.pointerId !== pointer) return; const to = ghost && target; stop(); if (to && !grid.destroyed) cgMoveGroup(grid, node, to.id, to.after); };
    const cancel = ev => { if (ev.pointerId === pointer) stop(); };
    const key = ev => { if (ev.key === "Escape") { ev.preventDefault(); stop(); } };
    grid.cancelColumnDrag = stop;
    grid.lifetime.signal.addEventListener("abort", stop, { once: true });
    global.addEventListener("pointermove", move); global.addEventListener("pointerup", end);
    global.addEventListener("pointercancel", cancel); global.addEventListener("keydown", key);
  }
