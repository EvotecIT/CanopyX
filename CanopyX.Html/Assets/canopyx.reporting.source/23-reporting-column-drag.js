  // ---------- pointer reorder: feedback first, one ID-based commit at release ----------
  DataGrid.prototype.startColumnDrag = function (event, column) {
    if (this.destroyed || event.button !== 0) return;
    if (this.cancelColumnDrag) this.cancelColumnDrag();
    if (this.cancelResize) this.cancelResize();
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    const pointer = event.pointerId, start = event.clientX, startY = event.clientY;
    let ghost = null, target = null, after = false, latest = event.clientX, frame = 0;
    const clear = () => this.headCells.forEach(cell => cell.classList.remove("cx-drop-before", "cx-drop-after"));
    const locate = () => {
      clear(); target = null;
      const frame = this.grid.getBoundingClientRect(), row = this.headRow.getBoundingClientRect();
      const x = Math.max(frame.left + this.grid.clientLeft + 1, Math.min(latest, frame.left + this.grid.clientLeft + this.grid.clientWidth - 1));
      const cell = document.elementFromPoint(x, row.top + row.height / 2)?.closest(".cx-hcell");
      const index = this.headCells.indexOf(cell);
      if (index < 0) return;
      const box = cell.getBoundingClientRect(); target = this.cols[index]; after = latest > box.left + box.width / 2;
      cell.classList.add(after ? "cx-drop-after" : "cx-drop-before");
    };
    const scroll = () => {
      const box = this.grid.getBoundingClientRect(), delta = latest < box.left + 36 ? -12 : latest > box.right - 36 ? 12 : 0;
      if (delta) { this.grid.scrollLeft += delta; locate(); }
      frame = requestAnimationFrame(scroll);
    };
    const move = ev => {
      if (ev.pointerId !== pointer) return;
      latest = ev.clientX;
      if (!ghost && Math.hypot(latest - start, ev.clientY - startY) < 5) return;
      if (!ghost) {
        ghost = h("div", "cx-column-drag"); ghost.setAttribute("aria-hidden", "true"); setText(ghost, column.title);
        const theme = getComputedStyle(this.host);
        for (const token of ["surface", "text", "accent", "line"]) ghost.style.setProperty("--cx-" + token, theme.getPropertyValue("--cx-" + token));
        document.body.appendChild(ghost); frame = requestAnimationFrame(scroll);
      }
      ghost.style.left = ev.clientX + 12 + "px"; ghost.style.top = ev.clientY + 12 + "px"; locate();
    };
    const stop = () => {
      global.removeEventListener("pointermove", move); global.removeEventListener("pointerup", end);
      global.removeEventListener("pointercancel", cancel); global.removeEventListener("blur", stop); global.removeEventListener("keydown", key);
      this.lifetime.signal.removeEventListener("abort", stop);
      cancelAnimationFrame(frame); if (ghost) ghost.remove(); clear();
      if (this.cancelColumnDrag === stop) this.cancelColumnDrag = null;
    };
    const end = ev => {
      if (ev.pointerId !== pointer) return;
      const next = ghost && target, direction = after; stop();
      if (next && !this.destroyed) this.moveReportingColumn(column, next, direction);
    };
    const cancel = ev => { if (ev.pointerId === pointer) stop(); };
    const key = ev => { if (ev.key === "Escape") { ev.preventDefault(); stop(); } };
    this.cancelColumnDrag = stop;
    this.lifetime.signal.addEventListener("abort", stop, { once: true });
    global.addEventListener("pointermove", move); global.addEventListener("pointerup", end);
    global.addEventListener("pointercancel", cancel); global.addEventListener("blur", stop); global.addEventListener("keydown", key);
  };
