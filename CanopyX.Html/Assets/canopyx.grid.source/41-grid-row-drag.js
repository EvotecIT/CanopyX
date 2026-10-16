  // ---------- grid: rows dragged out to a calendar (view.dragRows, docs/calendar.md#dropping-events) ----------
  // A grid whose view says dragRows lets its rows be dragged (HTML drag and drop, type application/x-canopyx-row) or picked
  // up with F2 from row focus, so a calendar that accepts drops can schedule them. GRID_DRAG holds the row in flight for the
  // page: the calendar reads its title and raw values while it hovers, and the picked row when Enter drops it.
  const GRID_DRAG = { item: null, picked: null };
  function gridDragItem(grid, row) {
    const header = grid.columns.find(column => column.rowHeader) || grid.columns.find(column => !column.hidden) || grid.columns[0];
    const cells = Object.create(null);
    for (const [id, cell] of Object.entries(row.h.cells)) cells[id] = cellValue(cell) ?? null;
    // A whole number of minutes (5 to 10,080) in a minutes column gives the scheduled event its length.
    const minutes = Number.isInteger(cells.minutes) && cells.minutes >= 5 && cells.minutes <= 10080 ? cells.minutes : null;
    return Object.freeze({ source: "grid", view: grid.view.id, id: row.key, title: cellText(row.h.cells[header.id], header, grid.fmt) || row.key, minutes, allDay: false, cells: Object.freeze(cells) });
  }
  Object.assign(DataGrid.prototype, {
    gridDragStart(event) {
      const element = event.target.closest?.(".cx-row"), row = element?._w;
      if (!this.view.dragRows || !row || row.status) return;
      const item = GRID_DRAG.item = gridDragItem(this, row);
      event.dataTransfer.setData("application/x-canopyx-row", JSON.stringify(item));
      event.dataTransfer.setData("text/plain", item.title);
      event.dataTransfer.effectAllowed = "copyMove";
    },
    /** F2 from row focus picks the row up (a dragRows grid); Escape puts it down. True when it handled the key. */
    gridPickKey(event, row, column) {
      if (!this.view.dragRows || row.status || column >= 0) return false;
      if (event.key === "Escape" && GRID_DRAG.picked) { GRID_DRAG.picked = null; return false; }
      if (event.key !== "F2") return false;
      GRID_DRAG.picked = gridDragItem(this, row);
      setText(this.live, fill(this.labels.gridRowPicked, { title: GRID_DRAG.picked.title }));
      event.preventDefault();
      return true;
    }
  });