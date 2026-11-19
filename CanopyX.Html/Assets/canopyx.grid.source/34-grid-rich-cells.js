  // ---------- rich cells: a cell object's html, sanitised by the rich-cells part (docs/data-protocol.md, "Rich cells") ----------
  // The part loads with the first cell that has markup; until then, and wherever a column's presenter or renderer applies,
  // the cell shows its text.
  const GRID_RICH_IMPL = {}, GRID_RICH = definePart(DataGrid, "rich-cells", "rich cells", () => ({ GRID_RICH_IMPL, trusted, gridPresenterLink }));
  /** Paints a cell's sanitised markup over its text, or takes the markup away from a cell that no longer has it. */
  function gridPaintRich(grid, slot, cell) {
    const html = isCellObject(cell) && typeof cell.html === "string" ? cell.html : null;
    if (slot.richHtml === html) return !!slot.rich;
    if (html !== null && !GRID_RICH_IMPL.content) {
      grid.richLoad ||= loadPart(GRID_RICH).then(() => { if (!grid.destroyed) { grid.version++; grid.scheduleRender(); } },
        error => { grid.richLoad = null; grid.emit("error", { error }); });
      return false;
    }
    slot.rich?.remove(); slot.rich = null; slot.richHtml = html;
    if (html === null) { slot.textSpan.hidden = false; return false; }
    const rich = slot.rich = h("span", "cx-rich");
    rich.appendChild(GRID_RICH_IMPL.content(html));
    // The grid is one Tab stop: links in the markup are reached with cell navigation, as host controls are.
    quietControls(rich);
    slot.textSpan.hidden = true; slot.textSpan.after(rich);
    return true;
  }
