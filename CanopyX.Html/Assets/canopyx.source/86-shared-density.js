  // A host's density is inherited by nested views; virtualization must follow the same height as its CSS.
  function sharedDensity(host) {
    const value = host.closest("[data-hfx-density]")?.getAttribute("data-hfx-density");
    return value === "compact" || value === "comfortable" ? value : null;
  }

  function watchSharedDensity(view) {
    let previous = sharedDensity(view.host);
    const metrics = () => { if (previous) view.host.style.setProperty("--cx-compact", previous === "compact" ? "1" : "0"); else view.host.style.removeProperty("--cx-compact"); };
    metrics();
    const observer = new MutationObserver(() => {
      const current = sharedDensity(view.host);
      if (current === previous || view.destroyed) return;
      previous = current; metrics();
      refreshSharedDensity(view);
    });
    for (let owner = view.host; owner; owner = owner.parentElement) {
      observer.observe(owner, { attributes: true, attributeFilter: ["data-hfx-density"] });
    }
    view.lifetime.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }

  // The first row in view and how far into it the view starts, as a share of its height.
  function layoutAnchor(view) {
    const rows = view.rowProjection || view, top = view.logicalTop(), count = rows.rowCount();
    if (!count) return null;
    const index = rows.rowAt(top), height = (view.autoRows ? null : view.rowH) || 1;
    const offset = Math.max(0, top - rows.rowTop(index));
    return { index, offset, share: Math.max(0, Math.min(1, offset / height)) };
  }
  // Applies a new fixed row height to a flat grid's rows and scroll range, keeping the anchor row in view.
  function layoutRows(view, anchor) {
    const rows = view.rowProjection || view;
    for (const row of [...view.rowCache.values(), ...view.placeholders.values()]) row.hpx = view.rowH;
    if (view.autoRows) {
      // Previous measurements keep a tall anchor row reachable until it is measured at the new density.
      for (const [index, height] of view.rowHeights) if (height < view.rowH) view.rowHeights.set(index, view.rowH);
      view.rowOffsets = null; view.measureNeeded = true; view.render();
    }
    else {
      const bounds = view.rowBounds(), count = view.rowProjection ? rows.rowCount() : Math.max(0, bounds.last - bounds.first + 1);
      view.total = count * view.rowH;
      view.syncScrollRange(anchor ? rows.rowTop(anchor.index) + anchor.share * view.rowH : 0);
    }
    if (anchor && view.autoRows) {
      const top = rows.rowTop(anchor.index), height = rows.rowTop(anchor.index + 1) - top;
      view.setLogicalTop(top + Math.min(anchor.offset, Math.max(0, height - 1)));
    }
    view.render();
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

  // Density changes update geometry without rebuilding header controls or loading optional layout UI.
  function refreshSharedDensity(view) {
    if (!view.grid) return;
    if (view.kind === "grid") {
      view.fitKey = null; view.fitFont = null;
      if (view.layoutMode === "cards" && VIEW_MODES.refreshCardDensity) VIEW_MODES.refreshCardDensity(view);
      else {
        const anchor = layoutAnchor(view);
        view.rowH = densityRowHeight(view, view.density);
        view.version++;
        layoutRows(view, anchor);
        view.applyWidths();
      }
    } else layoutApplyTree(view);
    view.host.style.setProperty("--cx-row-h", view.rowH + "px");
    view.fitHeight?.();
  }
