
  // ---------- tree grid: column sizing ----------
  Object.assign(TreeGrid.prototype, {
    applyWidths() {
      let sum = 0;
      this.cols.forEach((column, i) => {
        const width = renderedColumnWidth(column);
        this.headCells[i].style.width = width + "px";
        const grip = this.headCells[i].querySelector(".cx-resize");
        grip.setAttribute("aria-label", fill(this.labels.resizeColumn, { column: column.title }));
        grip.setAttribute("aria-valuenow", String(width));
        grip.setAttribute("aria-valuetext", fill(this.labels.columnWidth, { width: numberFormat(this.lang).format(width) }));
        sum += width;
      });
      this.rowWidth = sum;
      this.headRow.style.width = sum + "px";
      this.canvas.style.width = sum + "px";
      // Both the original and pooled painters place grid cells directly under the row.
      // Keep recycled rows in sync without replacing host-owned cell content.
      const resizeRow = (row) => {
        row.style.width = sum + "px";
        if (!row._kind || !row.firstElementChild) return;
        if (row._kind !== "node") row.firstElementChild.style.width = sum + "px";
        else this.cols.forEach((column, i) => { if (row.children[i]) row.children[i].style.width = renderedColumnWidth(column) + "px"; });
      };
      this.rendered.forEach(resizeRow);
      this.pool.forEach(resizeRow);
    },

    /** Sets a column's width in CSS pixels, within the limits a user has when dragging its edge. */
    setColumnWidth(columnId, width) {
      const column = this.columns.find((c) => c.id === columnId);
      if (!column || !Number.isFinite(width)) {
        throw new Error("CanopyX: setColumnWidth needs a column of the view and a width in pixels.");
      }
      // A drag in progress would put its own width back on the next pointer move.
      if (this.cancelResize) this.cancelResize();
      column.width = Math.min(MAX_COLUMN_WIDTH, Math.max(40, Math.round(width)));
      this.applyWidths();
      this.stateChanged();
    },

    /** Keeps the tree column in view while the other columns scroll sideways, or lets it scroll with them. */
    setTreeColumnPinned(pinned) {
      this.host.classList.toggle("cx-pin-tree", !!pinned);
      this.stateChanged();
    },

    startResize(e, column) {
      if (this.destroyed || e.button !== 0) return;
      if (this.cancelResize) this.cancelResize();
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = column.width;
      const pointer = e.pointerId;
      const move = (ev) => {
        if (ev.pointerId !== pointer) return;
        column.width = Math.min(MAX_COLUMN_WIDTH, Math.max(40, w0 + ev.clientX - x0));
        this.applyWidths();
      };
      const stop = () => {
        global.removeEventListener("pointermove", move);
        global.removeEventListener("pointerup", end);
        global.removeEventListener("pointercancel", end);
        global.removeEventListener("blur", stop);
        if (this.cancelResize === stop) this.cancelResize = null;
        this.stateChanged();
      };
      const end = (ev) => { if (ev.pointerId === pointer) stop(); };
      this.cancelResize = stop;
      global.addEventListener("pointermove", move);
      global.addEventListener("pointerup", end);
      global.addEventListener("pointercancel", end);
      global.addEventListener("blur", stop);
    }
  });
