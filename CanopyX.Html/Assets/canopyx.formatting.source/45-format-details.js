  // ---------- the record drawer: fields keep their formatting, including the columns a phone hides behind "+N" ----------
  // The drawer belongs to the filter editor part (generalised by the record panel part) and repaints its body for every
  // record it shows, then dispatches cx-drawer-paint. The part follows those paints through the grid's drawer hooks: it reads
  // the record from dialog._cxRecord and the fields from drawerFields(dialog), whose values carry data-cx-field, and
  // decorates each field of a targeted column. A row target marks the drawer's heading.
  function formatDrawer(grid, dialog) {
    let effects = [];
    const paint = () => {
      effects.forEach(formatUndo); effects = [];
      const head = dialog.querySelector(".cx-drawer-h"), title = head && head.querySelector("h4"), data = dialog._cxRecord;
      if (!dialog.isConnected || !title || !data || !grid.formatCompiled || !grid.formatCompiled.length) return;
      const result = grid.formatResult(data, true);
      if (!result) return;
      if (result.row) {
        const fx = formatEffects(head); effects.push(fx);
        formatDecorate(head, { tone: result.row.tone, descriptions: result.row.descriptions, glyph: result.row.glyph }, fx, title, "accent");
      }
      for (const field of grid.drawerFields(dialog)) {
        const target = field.column && result.cells.get(field.column.id);
        if (!target || !target.details) continue;
        const fx = formatEffects(field.value); effects.push(fx);
        formatDecorate(field.value, target, fx, field.value.firstChild, "fill");
      }
    };
    dialog.addEventListener("cx-drawer-paint", paint);
    dialog.addEventListener("close", () => { effects.forEach(formatUndo); effects = []; }, { once: true });
  }
  // After editing (order 10), before search highlighting (order 30): formatted values are marked, edit fields decorated.
  DataGrid.drawerHook(20, function (dialog) { formatDrawer(this, dialog); });
