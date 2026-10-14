  // ---------- column fitting shared by flat grids and trees: give way by priority, fill the width ----------
  // Each view measures its own columns (column.need, column.headNeed and this.fitCh, the width of eleven digits) and calls
  // these routines; flat grids mix them into DataGrid (33-grid-column-fit.js), and the tree tools part, which includes this
  // part, mixes them into TreeGrid. Spare width goes to flex columns, then the identity column up to the cap, then it is
  // shared with the widest normal text column. A shortfall first takes slack from normal and optional columns, then hides
  // optional columns, and only then scrolls with pinned columns.
  function gridPriority(value) {
    return ["essential", "normal", "optional"].includes(value) || Number.isInteger(value) && value >= 0 && value <= MAX_PROTOCOL_INTEGER;
  }
  // Numeric priorities follow DataTables' responsivePriority: 0-1 essential, 10000 and above optional, normal between.
  function gridRank(column) {
    const value = column.priority;
    return typeof value === "number" ? value : value === "optional" ? 10000 : value === "essential" || value === undefined && column.identity ? 0 : 5000;
  }
  function gridLevel(column) { const rank = gridRank(column); return rank < 2 ? 0 : rank < 10000 ? 1 : 2; }
  function gridOptions(column) { return column.presenter || {}; }
  // Text columns drawn as graphics keep their measured width and never take spare width.
  function gridTextual(column) {
    return column.kind === "text" && !["statusStrip", "sparklineBars", "sparklineLine", "boolean", "progress"].includes(gridOptions(column).kind);
  }
  // Declared sizing, before state preparation: the preferred width, the declared width saved views keep, and flex.
  function gridFitColumn(column, identity) {
    prepareWidth(column);
    column.identity = column === identity; column.pref = column.autoWidth ? 0 : column.width; column.basePriority = column.priority; column.declared = column.width;
    column.flexWeight = typeof column.flex === "number" ? column.flex : 0;
    if (column.flexWeight) column.flex = true; else if (typeof column.flex === "number") delete column.flex;
  }

  const COLUMN_FIT = {
    fitManual(column) { column.width = column.renderWidth ?? column.width; column.sized = true; },
    // The base width (content or preferred), the content width (level 2), or the narrowest width before hiding
    // (level 1): essential columns keep their content width.
    fitSize(column, level) {
      // reserve: width a view keeps beside the column's content, such as the flat grid's phone "+N" button.
      const need = (column.need ?? column.width) + (column.reserve || 0);
      // The default identity yields last, only when that can avoid scrolling. Explicit or user-sized widths stay.
      if (level === 0) return column.identity && column.priority === undefined && !column.fixed && !column.sized ?
        Math.max(column.minW, column.headNeed || 0) : column.renderWidth;
      return Math.round(columnWidth(column, column.fixed || column.sized ? column.width : !level ? Math.max(need, column.pref) : level > 1 || !gridLevel(column) ? need :
        Math.min(need, Math.max(column.headNeed || 0, gridTextual(column) ? this.fitCh || 88 : 0))));
    },
    // Sets renderWidth on the shown columns for a viewport of the given width. A shortfall first takes the preferred width
    // above content (so long values keep their measured width before short columns keep their declared one), then content
    // slack down to the floors; spare width is spread by fitSpare.
    fitWidths(cols, width) {
      let total = 0, target;
      for (const column of cols) total += column.renderWidth = this.fitSize(column);
      for (const level of [2, 1, 0]) if (width && total > width) {
        let slack = 0;
        for (const column of cols) slack += column.renderWidth - this.fitSize(column, level);
        if (!level && slack < total - width) continue;
        const share = Math.min(1, (total - width) / slack || 0); total = 0;
        for (const column of cols) total += column.renderWidth -= (column.renderWidth - this.fitSize(column, level)) * share;
      }
      if (width && total < width) target = this.fitSpare(cols.filter(column => !column.fixed && !column.sized), width - total);
      total = 0;
      for (const column of cols) total += column.renderWidth = Math.floor(column.renderWidth);
      if (target) target.renderWidth += Math.min(width - total, target.maxW - target.renderWidth);
      return cols.map(column => column.renderWidth);
    },
    fitSpare(columns, spare) {
      let target, flex = columns.filter(column => column.flex && column.flexWeight);
      const grow = (column, limit) => {
        const add = column ? Math.min(spare, Math.min(limit, column.maxW) - column.renderWidth) : 0;
        if (add > 0) { column.renderWidth += add; spare -= add; target = column; }
      };
      for (let before = 0; spare > 0.5 && flex.length && before !== spare;) {
        const weight = flex.reduce((sum, column) => sum + column.flexWeight, 0); before = spare;
        for (const column of flex) grow(column, column.renderWidth + before * column.flexWeight / weight);
        flex = flex.filter(column => column.maxW - column.renderWidth > 0.5);
      }
      const identity = columns.find(column => column.identity), widest = columns.filter(column => !column.identity &&
        gridTextual(column) && gridLevel(column) === 1).sort((a, b) => b.need - a.need)[0];
      grow(identity, 420);
      if (identity && widest) grow(widest, widest.renderWidth + spare * widest.need / (widest.need + identity.need));
      grow(identity, Infinity); grow(widest, Infinity);
      return target;
    },
    // Hides optional columns (and normal ones on phones) until the floors fit. Essential, pinned and sized columns stay.
    fitHide(shown, width, phone) {
      let total = 0, remaining = shown.length;
      for (const column of this.columns) column.fitHidden = false;
      for (const column of shown) total += this.fitSize(column, 1);
      for (const column of shown.filter(column => column.pin === "none" && !column.sized && !column.alwaysVisible &&
          gridLevel(column) > !phone).sort((a, b) => gridLevel(b) - gridLevel(a) || gridRank(b) - gridRank(a) || shown.indexOf(b) - shown.indexOf(a)))
        if (total > width && remaining > 1) { column.fitHidden = true; total -= this.fitSize(column, 1); remaining--; }
    }
  };
