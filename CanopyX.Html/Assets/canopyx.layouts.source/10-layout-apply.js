  // ---------- layout modes: fit, scroll and cards, and the density (docs/layout-modes.md) ----------
  // Fit is the default: columns give way by priority and hidden fields wait behind "+N" and the drawer. Scroll keeps every
  // column at its own width and pins the identity column (the shared column fitting reads layoutMode). Cards stack each
  // record's fields under its title, for phones and narrow panels: a card has a fixed height for the grid's width, so
  // virtual rows, scroll positions and keyboard paging keep working at any size. Switching keeps the query (sort, filters,
  // search), the selection, the focused row and cell, and the first row in view.
  const CARD_METRICS = { compact: { pad: 12, field: 36, gap: 8, title: 28 }, default: { pad: 16, field: 40, gap: 10, title: 30 }, comfortable: { pad: 20, field: 44, gap: 12, title: 32 } };
  const CARD_MIN = 280, CARD_GUTTER = 16, CARD_COLUMN_GAP = 16, CARD_WIDE = ["longText", "tags", "list"];
  function cardWide(column) { return !!column.wrap || !!column.flex || CARD_WIDE.includes(column.presenter?.kind); }
  // Presenters remain responsible for status semantics. A final date is a quiet footer; no field IDs are special.
  function cardRole(column, index, columns) {
    if (!index) return "title";
    if (["enum", "state"].includes(column.presenter?.kind)) return "pill";
    if (index === columns.length - 1 && column.kind === "datetime") return "footer";
    return cardWide(column) ? "wide" : "field";
  }
  function cardGeometry(view) {
    const metrics = { ...CARD_METRICS[view.density] }, available = Math.max(0, (view.grid.clientWidth || view.host.clientWidth) - 2 * CARD_GUTTER);
    // Synthetic group/detail rows keep their own projection, measured offsets and keyboard semantics.
    const lanes = view.rowProjection ? 1 : Math.max(1, Math.floor((available + CARD_COLUMN_GAP) / (CARD_MIN + CARD_COLUMN_GAP)));
    const width = Math.max(0, (available - (lanes - 1) * CARD_COLUMN_GAP) / lanes), fields = (view.cols || []).slice(1);
    const columns = width - 2 * metrics.pad >= 264 ? 2 : 1, span = columns;
    const font = parseFloat(getComputedStyle(view.grid).fontSize), clampLines = column => Math.min(column.maxLines ?? 2, 2);
    if (fields.some(column => column.wrap)) metrics.field = Math.max(metrics.field,
      Math.ceil(11.5 * 1.35 + 1 + font * 1.4 * Math.max(...fields.filter(column => column.wrap).map(clampLines))));
    if (view.cols?.[0]?.wrap) metrics.title = Math.max(metrics.title, Math.ceil((font + 1) * 1.4 * clampLines(view.cols[0])));
    let lines = 0, used = 0;
    fields.forEach((column, index) => {
      const role = cardRole(column, index + 1, view.cols), size = role === "field" ? 1 : columns;
      if (used && used + size > columns) { lines++; used = 0; }
      used += size;
      if (used === columns) { lines++; used = 0; }
    });
    if (used) lines++;
    const height = 2 * metrics.pad + metrics.title + lines * (metrics.field + metrics.gap) + 2;
    return { columns, span, lanes, width, metrics, height, pitch: height + CARD_COLUMN_GAP };
  }
  function cardStyle(view, geometry) {
    const style = view.host.style, { metrics } = geometry;
    style.setProperty("--cx-card-cols", String(geometry.columns)); style.setProperty("--cx-card-span", String(geometry.span)); style.setProperty("--cx-card-pad", metrics.pad + "px");
    style.setProperty("--cx-card-field", metrics.field + "px"); style.setProperty("--cx-card-gap", metrics.gap + "px");
    style.setProperty("--cx-card-title", metrics.title + "px"); style.setProperty("--cx-card-width", geometry.width + "px");
    style.setProperty("--cx-card-height", geometry.height + "px");
    view.cardGeometry = geometry;
    cardMinHeight(view);
  }
  function cardMinHeight(view) {
    const count = view.rowProjection ? view.rowProjection.rowCount() : Math.max(0, view.rowBounds().last - view.pageOffset + 1);
    const bands = Math.ceil(count / view.cardGeometry.lanes), chrome = [...view.host.children].reduce((height, child) => height + (child === view.grid ? 0 : child.offsetHeight), 2);
    view.host.style.setProperty("--cx-min-h", chrome + Math.min(2, Math.max(1, bands)) * view.cardGeometry.pitch + CARD_GUTTER + "px");
  }
  function cardTotal(view) {
    const bounds = view.rowBounds(), count = Math.max(0, bounds.last - bounds.first + 1);
    return count ? Math.ceil(count / view.cardGeometry.lanes) * view.rowH + CARD_GUTTER : 0;
  }
  // Tiled cards specialize the optional geometry; ordinary rows keep the shared density owner's anchor behavior.
  function layoutCardRows(view, anchor) {
    const ownedFocus = view.canvas.contains(document.activeElement);
    if (view.layoutMode === "cards" && !view.rowProjection) {
      for (const row of [...view.rowCache.values(), ...view.placeholders.values()]) row.hpx = view.rowH;
      view.total = cardTotal(view);
      view.syncScrollRange(anchor ? view.rowTop(anchor.index) + anchor.share * view.rowH : 0);
      view.render();
    } else layoutRows(view, anchor);
    if (ownedFocus) layoutKeepFocus(view);
  }
  // Resize delivery can briefly apply the ordinary rows' minimum height before cards override it, clamping native scroll.
  // Re-reveal after that delivery settles, including when the card width/height itself did not change.
  function layoutKeepFocus(view) {
    if (!view.focused || !view.canvas.contains(document.activeElement)) return;
    cancelAnimationFrame(view.cardFocusFrame);
    view.cardFocusFrame = requestAnimationFrame(() => {
      if (view.destroyed || !view.canvas.contains(document.activeElement)) return;
      const rows = view.rowProjection || view, index = rows.indexOf(view.focused);
      if (index >= 0) { view.revealGridRow(view.focused, index, rows); view.render(); }
    });
  }

  function layoutApplyGrid(view, mode, anchor) {
    if (mode === "cards") { if (view.cardAutoRows === undefined) { view.cardAutoRows = view.autoRows; view.autoRows = false; } }
    else if (view.cardAutoRows !== undefined) { view.autoRows = view.cardAutoRows; view.cardAutoRows = undefined; view.rowOffsets = null; }
    view.fitFont = null; view.fitKey = null;
    view.layout = (view.layout || 0) + 1; view.version++;
    view.layoutApplying = true;
    try { view.buildHeader(); view.syncColumnControls(); } finally { view.layoutApplying = false; }
    if (mode === "cards") { const geometry = cardGeometry(view); cardStyle(view, geometry); view.rowH = geometry.pitch; }
    else view.rowH = densityRowHeight(view, view.density);
    layoutCardRows(view, anchor);
    view.syncPinnedShadows?.();
  }

  /** Switches a view to a layout mode and density, keeping its query, selection, focus and the first row in view. */
  function layoutApply(view, mode, density) {
    const active = document.activeElement, held = view.canvas.contains(active) ? active : null, anchor = view.kind === "grid" ? layoutAnchor(view) : null;
    const cell = held?.closest(".cx-cell"), row = view.focused, column = cell && view.cols[view.rowCells(cell.parentNode).indexOf(cell)]?.id;
    view.layoutMode = mode; view.density = density;
    view.host.setAttribute("data-cx-density", density);
    if (mode === "fit") view.host.removeAttribute("data-cx-layout"); else view.host.setAttribute("data-cx-layout", mode);
    view.host.style.setProperty("--cx-row-h", densityRowHeight(view, density) + "px");
    if (view.kind === "grid") layoutApplyGrid(view, mode, anchor); else layoutApplyTree(view);
    if (held && row && view.rendered.get(row)) {
      const at = column ? view.cols.findIndex(item => item.id === column) : -1;
      if (at >= 0) view.focusCell(row, at, null); else view.rendered.get(row).focus({ preventScroll: true });
    }
  }
