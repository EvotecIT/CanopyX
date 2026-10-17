  // ---------- tree tools: pinned columns besides the tree column ----------
  // The tree column pins left (the cx-pin-tree class). Like a flat grid, any other column pins left or right (pinned in the
  // view, setColumnPinned, or remembered state): left pins follow the tree column and right pins stay at the right edge while
  // the other columns scroll. Pinned columns hide for width only on phones, after the others, to keep the tree column
  // readable (33-column-fit-core.js); when they would leave the scrolling columns less than 128 pixels, the innermost of
  // them scroll too.
  const TREE_PINS = {};
  for (const name of ["applyWidths", "render", "setTreeColumnPinned"]) TREE_PINS[name] = TreeGrid.prototype[name];

  Object.assign(TreeGrid.prototype, {
    // The tree column first, then the left pins, the scrolling columns and the right pins.
    groupPins() {
      const [tree, ...rest] = this.columns;
      this.columns = [tree, ...["left", "none", "right"].flatMap(side => rest.filter(column => (column.pin || "none") === side))];
    },
    setColumnPinned(id, pin) {
      const column = this.columns.find(item => item.id === id);
      if (!column || column === this.columns[0] || !["none", "left", "right"].includes(pin)) throw new Error("CanopyX: invalid column pin.");
      column.pin = pin; this.groupPins(); this.columnsChanged(); this.emit("columnPin", { column: id, pin });
    },
    applyWidths(widths) {
      TREE_PINS.applyWidths.call(this, widths);
      if (this.fitReady && this.cols) this.pinRows(true);
    },
    // Left pins start after the tree column only while it is pinned.
    setTreeColumnPinned(pinned) {
      TREE_PINS.setTreeColumnPinned.call(this, pinned);
      if (this.fitReady && this.cols) this.pinRows(true);
    },
    render() {
      const result = TREE_PINS.render.call(this);
      this.pinRows();
      return result;
    },
    // Measures the offsets from the widths on screen (measure), then places the header cells and the rendered rows' cells.
    pinRows(measure) {
      const cols = this.cols, width = column => column.renderWidth ?? column.width;
      if (measure) {
        let start = this.host.classList.contains("cx-pin-tree") ? width(cols[0]) : 0, end = 0;
        // From the edges inward, each side stops at the first pin that does not fit: the inner ones scroll.
        let stop = false;
        const room = column => !(stop ||= start + end + width(column) > this.grid.clientWidth - 128);
        for (const column of cols) column.pinAt = null;
        for (const column of cols.slice(1)) if (column.pin === "left" && room(column)) { column.pinAt = start; start += width(column); }
        stop = false;
        for (const column of cols.slice(1).reverse()) if (column.pin === "right" && room(column)) { column.pinAt = end; end += width(column); }
        this.pinned = cols.some(column => column.pinAt != null);
      }
      const place = (cell, column) => {
        const side = column?.pinAt != null && column.pin, key = side && side + column.pinAt;
        if (cell._pin === key) return;
        cell._pin = key; cell.style.left = cell.style.right = "";
        if (side) { cell.dataset.cxPin = side; cell.style[side] = column.pinAt + "px"; } else delete cell.dataset.cxPin;
      };
      // Once a layout placed pins, every render checks its rows: rows reused from the pool may still carry them.
      if (!(this.pinsPlaced ||= this.pinned)) return;
      this.headCells.forEach((cell, index) => place(cell, cols[index]));
      for (const row of this.rendered.values()) if (row._kind === "node") row._cells.forEach((slot, index) => place(slot.cell, cols[index]));
    }
  });
