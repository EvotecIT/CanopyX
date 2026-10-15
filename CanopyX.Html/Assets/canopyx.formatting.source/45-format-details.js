  // ---------- the record drawer: fields keep their formatting, including the columns a phone hides behind "+N" ----------
  // The drawer belongs to the filter editor part and repaints its body for every record it shows. The part follows it: it
  // tracks the record's position (opening, then each previous/next move), checks the drawer's title against that record,
  // and decorates each field of a targeted column after every repaint. A row target marks the drawer's heading.
  function formatDrawerTitle(grid, data) {
    const primary = grid.visibleColumns()[0];
    return cellText(data.cells[primary.id], primary, grid.fmt) || data.id;
  }
  function formatDrawer(grid, dialog, index) {
    const body = dialog.querySelector(".cx-drawer-body"), head = dialog.querySelector(".cx-drawer-h"), title = head && head.querySelector("h4");
    if (!body || !title) return;
    let shown = index, effects = [];
    grid.formatDrawerIndex = index;
    const observer = new MutationObserver(() => paint()), observe = () => observer.observe(body, { childList: true });
    const paint = () => {
      observer.disconnect(); effects.forEach(formatUndo); effects = [];
      const candidate = grid.rowCache.get(grid.formatDrawerIndex), data = candidate && formatDrawerTitle(grid, candidate.h) === title.textContent ?
        (shown = grid.formatDrawerIndex, candidate.h) : grid.rowCache.get(shown)?.h;
      const result = data && grid.formatResult(data);
      if (result) {
        if (result.row) {
          const fx = formatEffects(head); effects.push(fx);
          formatDecorate(head, { tone: result.row.tone, descriptions: result.row.descriptions, glyph: result.row.glyph }, fx, title, "accent");
        }
        // Fields are written per section in column order; a title names its column, in that order for repeated titles.
        const queue = new Map();
        for (const column of grid.columns) { const list = queue.get(column.title) || []; list.push(column); queue.set(column.title, list); }
        for (const term of body.querySelectorAll("dl > dt")) {
          const column = (queue.get(term.textContent) || []).shift(), value = term.nextElementSibling, target = column && result.cells.get(column.id);
          if (!target || !target.details || !value) continue;
          const fx = formatEffects(value); effects.push(fx);
          formatDecorate(value, target, fx, value.firstChild, "fill");
        }
      }
      if (dialog.isConnected) observe();
    };
    paint();
    dialog.addEventListener("close", () => { observer.disconnect(); grid.formatDrawerIndex = undefined; }, { once: true });
  }
  // The filter editor part assigns openGridDrawer when it installs, before or after this part; either way the drawer it
  // opens is followed. The grid API binds its methods when a grid is created, so the part hooks only internal methods.
  const FORMAT_PROTO = DataGrid.prototype, FORMAT_FOCUS = FORMAT_PROTO.focusResult;
  const formatDrawerHook = open => open && function (record, index, returnFocus) {
    const result = open.call(this, record, index, returnFocus), dialog = this.recordDrawer;
    if (dialog && !dialog._cxFormat && this.formatCompiled && this.formatCompiled.length) { dialog._cxFormat = true; formatDrawer(this, dialog, index); }
    return result;
  };
  let formatOpenDrawer = formatDrawerHook(Object.getOwnPropertyDescriptor(FORMAT_PROTO, "openGridDrawer")?.value);
  Object.defineProperty(FORMAT_PROTO, "openGridDrawer", { configurable: true, get: () => formatOpenDrawer, set(open) { formatOpenDrawer = formatDrawerHook(open); } });
  // The drawer moves with focusResult; the position is what its next repaint shows.
  FORMAT_PROTO.focusResult = function (index, ...rest) {
    if (this.recordDrawer && this.recordDrawer._navigating && this.recordDrawer._cxFormat) this.formatDrawerIndex = index;
    return FORMAT_FOCUS.call(this, index, ...rest);
  };
