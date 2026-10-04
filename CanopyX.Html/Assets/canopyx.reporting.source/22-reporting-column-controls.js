  // ---------- direct header moves and accessible auto-fit ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridMoveColumn: "{column}: drag to move, or use Left/Right", gridResizeHelp: "Enter fits up to 200 loaded rows; Left/Right resizes.",
    gridColumnMoved: "{column} moved to position {position}"
  }));
  const LAYOUT_HEADER = DataGrid.prototype.buildHeader, LAYOUT_ORDER = DataGrid.prototype.setColumnOrder;
  DataGrid.prototype.buildHeader = function () {
    if (this.cancelColumnDrag) this.cancelColumnDrag();
    const active = document.activeElement, held = active && active.classList.contains("cx-column-move") && this.headRow.contains(active) ?
      active.closest("[data-cx-column]").getAttribute("data-cx-column") : null;
    LAYOUT_HEADER.call(this);
    this.cols.forEach((column, index) => {
      const cell = this.headCells[index], grip = cell.querySelector(".cx-resize");
      grip.setAttribute("aria-description", this.labels.gridResizeHelp); grip.title = this.labels.gridResizeHelp;
      grip.addEventListener("dblclick", () => GRID_REPORTING.fitColumn(this, column.id));
      grip.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); GRID_REPORTING.fitColumn(this, column.id); }
        else if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) reportingManualWidth(this, column);
      }, true);
      if (!this.view.reporting || !this.view.reporting.columnReorder) return;
      const move = h("button", "cx-column-move"); move.type = "button"; setText(move, "⋮⋮");
      move.setAttribute("aria-label", fill(this.labels.gridMoveColumn, { column: column.title })); move.title = move.getAttribute("aria-label");
      cell.prepend(move);
      move.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const at = this.cols.indexOf(column), target = this.cols[at + (event.key === "ArrowLeft" ? -1 : 1)];
        if (target) this.moveReportingColumn(column, target, event.key === "ArrowRight");
      });
      move.addEventListener("pointerdown", event => this.startColumnDrag(event, column));
      if (held === column.id) move.focus({ preventScroll: true });
    });
  };
  DataGrid.prototype.setColumnOrder = function (ids) {
    const held = this.heldCell(), columnId = held && this.cols[held.index] && this.cols[held.index].id;
    LAYOUT_ORDER.call(this, ids);
    if (held && columnId) {
      this.render(); const index = this.cols.findIndex(column => column.id === columnId);
      if (index >= 0) this.focusCell(held.w, index, held.control < 0 ? null : held.control);
    }
  };
  DataGrid.prototype.moveReportingColumn = function (column, target, after) {
    if (column === target) return;
    const ids = this.columns.map(item => item.id).filter(id => id !== column.id), at = ids.indexOf(target.id) + (after ? 1 : 0);
    ids.splice(at, 0, column.id); this.setColumnOrder(ids);
    const position = this.cols.findIndex(item => item.id === column.id);
    this.headCells[position].querySelector(".cx-column-move").focus({ preventScroll: true });
    setText(this.live, fill(this.labels.gridColumnMoved, { column: column.title, position: position + 1 }));
  };
