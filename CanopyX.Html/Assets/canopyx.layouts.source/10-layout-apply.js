  // ---------- layout modes: fit, scroll and cards, and the density (docs/layout-modes.md) ----------
  // Fit is the default: columns give way by priority and hidden fields wait behind "+N" and the drawer. Scroll keeps every
  // column at its own width and pins the identity column (the shared column fitting reads layoutMode). Cards stack each
  // record's fields under its title, for phones and narrow panels: a card has a fixed height for the grid's width, so
  // virtual rows, scroll positions and keyboard paging keep working at any size. Switching keeps the query (sort, filters,
  // search), the selection, the focused row and cell, and the first row in view.
  const CARD_METRICS = { compact: { pad: 8, field: 36, gap: 4, title: 24 }, default: { pad: 12, field: 40, gap: 6, title: 26 }, comfortable: { pad: 16, field: 44, gap: 8, title: 28 } };
  const CARD_FIELD = 140, CARD_GUTTER = 16, CARD_COLUMN_GAP = 16, CARD_WIDE = ["longText", "tags", "list"];
  // Free text (wrapping, long text, tags, lists and flexible columns) takes two field slots, or the whole line on a narrow card.
  function cardWide(column) { return !!column.wrap || !!column.flex || CARD_WIDE.includes(column.presenter?.kind); }
  // Fields per line, from the grid's width, and the card height that holds the title and every shown field. The lines are
  // counted by placing the fields the way the stylesheet's dense grid does: each in the first free run of slots.
  function cardGeometry(view) {
    const metrics = CARD_METRICS[view.density], width = Math.max(0, (view.grid.clientWidth || view.host.clientWidth) - 2 * CARD_GUTTER);
    const fields = (view.cols || []).slice(1), most = Math.max(1, Math.floor((width + CARD_COLUMN_GAP) / (CARD_FIELD + CARD_COLUMN_GAP)));
    // As few lines as the width allows, with the fields spread evenly over them.
    const slots = fields.reduce((sum, field) => sum + (cardWide(field) && most > 1 ? 2 : 1), 0) || 1;
    const columns = Math.min(most, Math.ceil(slots / Math.ceil(slots / most))), span = Math.min(2, columns), rows = [];
    for (const field of fields) {
      const size = cardWide(field) ? span : 1;
      for (let row = 0, placed = false; !placed; row++) {
        const cells = rows[row] ||= new Array(columns).fill(false);
        for (let at = 0; at + size <= columns && !placed; at++) if (cells.slice(at, at + size).every(used => !used)) { cells.fill(true, at, at + size); placed = true; }
      }
    }
    const lines = rows.length;
    return { columns, span, metrics, height: 2 * metrics.pad + metrics.title + (lines ? metrics.gap + lines * metrics.field + (lines - 1) * metrics.gap : 0) + 1 };
  }
  function cardStyle(view, geometry) {
    const style = view.host.style, { metrics } = geometry;
    style.setProperty("--cx-card-cols", String(geometry.columns)); style.setProperty("--cx-card-span", String(geometry.span)); style.setProperty("--cx-card-pad", metrics.pad + "px");
    style.setProperty("--cx-card-field", metrics.field + "px"); style.setProperty("--cx-card-gap", metrics.gap + "px");
    style.setProperty("--cx-card-title", metrics.title + "px");
  }
  // The first row in view and how far into it the view starts, as a share of its height.
  function layoutAnchor(view) {
    const rows = view.rowProjection || view, top = view.logicalTop(), count = rows.rowCount();
    if (!count) return null;
    const index = rows.rowAt(top), height = (view.autoRows ? null : view.rowH) || 1;
    return { index, share: Math.max(0, Math.min(1, (top - rows.rowTop(index)) / height)) };
  }
  // Applies a new fixed row height to a flat grid's rows and scroll range, keeping the anchor row in view.
  function layoutRows(view, anchor) {
    const rows = view.rowProjection || view;
    for (const row of [...view.rowCache.values(), ...view.placeholders.values()]) row.hpx = view.rowH;
    if (view.autoRows) { view.rowOffsets = null; view.rowHeights?.clear(); view.measureNeeded = true; view.render(); }
    else {
      const bounds = view.rowBounds(), count = view.rowProjection ? rows.rowCount() : Math.max(0, bounds.last - bounds.first + 1);
      view.total = count * view.rowH;
      view.syncScrollRange(anchor ? rows.rowTop(anchor.index) + anchor.share * view.rowH : 0);
    }
    if (anchor && view.autoRows) view.setLogicalTop(rows.rowTop(anchor.index));
    view.render();
  }

  function layoutApplyGrid(view, mode) {
    const anchor = layoutAnchor(view);
    if (mode === "cards") { if (view.cardAutoRows === undefined) { view.cardAutoRows = view.autoRows; view.autoRows = false; } }
    else if (view.cardAutoRows !== undefined) { view.autoRows = view.cardAutoRows; view.cardAutoRows = undefined; view.rowOffsets = null; }
    view.fitFont = null; view.fitKey = null;
    view.layout = (view.layout || 0) + 1; view.version++;
    view.layoutApplying = true;
    try { view.buildHeader(); view.syncColumnControls(); } finally { view.layoutApplying = false; }
    if (mode === "cards") { const geometry = cardGeometry(view); cardStyle(view, geometry); view.rowH = geometry.height; }
    else view.rowH = densityRowHeight(view, view.density);
    layoutRows(view, anchor);
    view.syncPinnedShadows?.();
  }

  function layoutApplyTree(view) {
    const before = view.rowH, after = densityRowHeight(view, view.density);
    if (before !== after) {
      const anchor = view.captureScrollAnchor();
      view.rowH = after;
      const status = row => { if (row && row.hpx === before) row.hpx = after; };
      status(view.root._status);
      for (const row of view.keyMap.values()) { if (!row.h?.detail && row.hpx === before) row.hpx = after; status(row._status); }
      for (const row of view.rows) if (row.status) status(row);
      view.retop();
      if (anchor) view.restoreScrollAnchor(anchor);
    }
    view.fitKey = null; view.version++;
    if (view.fitReady) view.applyWidths();
    view.render();
  }

  /** Switches a view to a layout mode and density, keeping its query, selection, focus and the first row in view. */
  function layoutApply(view, mode, density) {
    const active = document.activeElement, held = view.canvas.contains(active) ? active : null;
    const cell = held?.closest(".cx-cell"), row = view.focused, column = cell && view.cols[view.rowCells(cell.parentNode).indexOf(cell)]?.id;
    view.layoutMode = mode; view.density = density;
    view.host.setAttribute("data-cx-density", density);
    if (mode === "fit") view.host.removeAttribute("data-cx-layout"); else view.host.setAttribute("data-cx-layout", mode);
    view.host.style.setProperty("--cx-row-h", densityRowHeight(view, density) + "px");
    if (view.kind === "grid") layoutApplyGrid(view, mode); else layoutApplyTree(view);
    if (held && row && view.rendered.get(row)) {
      const at = column ? view.cols.findIndex(item => item.id === column) : -1;
      if (at >= 0) view.focusCell(row, at, null); else view.rendered.get(row).focus({ preventScroll: true });
    }
  }
