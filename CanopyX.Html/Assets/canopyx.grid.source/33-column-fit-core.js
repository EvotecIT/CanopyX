  // ---------- column fitting shared by flat grids and trees: give way by priority, fill the width ----------
  // Each view measures its own columns (column.need, column.headNeed and this.fitCh, the width of eleven digits) and calls
  // these routines; flat grids mix them into DataGrid (33-grid-column-fit.js), and the tree tools part, which includes this
  // part, mixes them into TreeGrid. Spare width goes to flex columns, then the identity column up to the cap, then it is
  // shared with the widest normal text column. A shortfall first takes slack from long free text (flex columns, then the
  // widest text columns), then from the other columns, then hides optional columns, and only then scrolls with pinned columns.
  function gridPriority(value) {
    return ["essential", "normal", "optional"].includes(value) || Number.isInteger(value) && value >= 0 && value <= MAX_PROTOCOL_INTEGER;
  }
  // Numeric priorities: 0-1 are essential, 10000 and above optional, the numbers between normal.
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
    // slack down to the floors (fitShrink); spare width is spread by fitSpare.
    fitWidths(cols, width) {
      let total = 0, target;
      for (const column of cols) total += column.renderWidth = this.fitSize(column);
      // The scroll and card layouts (87-view-modes.js) keep every column at its own width and scroll sideways instead.
      if (width && total > width && this.layoutMode && this.layoutMode !== "fit") width = total;
      // The identity column yields its content width (level 0) only when that avoids scrolling.
      for (const level of [2, 1, 0]) if (width && total > width && (level || cols.reduce((sum, column) => sum + column.renderWidth - this.fitSize(column, 0), 0) >= total - width))
        total = width + this.fitShrink(cols, total - width, level);
      if (width && total < width) target = this.fitSpare(cols.filter(column => !column.fixed && !column.sized), width - total);
      total = 0;
      for (const column of cols) total += column.renderWidth = Math.floor(column.renderWidth);
      // Rounding down leaves a pixel per column, and the growing columns may have reached their maximum: the last text column
      // with room takes the rest, so the rows end at the edge (graphic and number columns keep their width).
      if (width > total && !(target?.renderWidth < target?.maxW)) for (const column of cols)
        if (!column.fixed && !column.sized && column.renderWidth < column.maxW && gridTextual(column)) target = column;
      if (target) target.renderWidth += Math.min(width - total, target.maxW - target.renderWidth);
      return cols.map(column => column.renderWidth);
    },
    // Takes up to excess pixels down to the widths of a level (fitSize). Long free text gives way first: the flex columns, then
    // the text columns, then all the others, each group levelled down from its widest column to one common width that no
    // column goes below its floor for. Short and fixed-format values (dates, numbers, states, short names) so keep their whole
    // width while the total allows. Returns the excess left.
    fitShrink(cols, excess, level) {
      for (const group of [cols.filter(column => column.flex), cols.filter(gridTextual), cols]) {
        if (excess <= 0.5) break;
        const floor = new Map(group.map(column => [column, Math.min(column.renderWidth, this.fitSize(column, level))]));
        const cut = width => group.reduce((sum, column) => sum + Math.max(0, column.renderWidth - Math.max(width, floor.get(column))), 0);
        let low = 0, high = Math.max(0, ...group.map(column => column.renderWidth));
        for (let step = 0; step < 24; step++) { const middle = (low + high) / 2; if (cut(middle) >= excess) low = middle; else high = middle; }
        excess -= cut(low);
        for (const column of group) column.renderWidth = Math.min(column.renderWidth, Math.max(low, floor.get(column)));
      }
      return excess;
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
    // Hides optional columns (and normal ones on phones) until the floors fit. Essential, pinned and sized columns stay,
    // except on phones: there the identity column (a tree's tree column) keeps its indent and about two dozen characters
    // (indentNeed, set by trees, plus twice fitCh) beside its "+N" button, and pinned columns that are not essential hide,
    // after the others and in the same order, rather than cut it short.
    fitHide(shown, width, phone) {
      let total = 0, remaining = shown.length;
      const order = (a, b) => gridLevel(b) - gridLevel(a) || gridRank(b) - gridRank(a) || shown.indexOf(b) - shown.indexOf(a), identity = phone && shown.find(column => column.identity);
      const hide = (column, pinned) => !column.sized && !column.alwaysVisible && (column.pin === "none") !== pinned && !(phone && column.identity) && gridLevel(column) > !phone;
      for (const column of this.columns) column.fitHidden = false;
      if (this.layoutMode && this.layoutMode !== "fit") return;
      for (const column of shown) total += this.fitSize(column, 1);
      for (const column of shown.filter(column => hide(column, false)).sort(order))
        if (total > width && remaining > 1) { column.fitHidden = true; total -= this.fitSize(column, 1); remaining--; }
      if (identity && !identity.fixed && !identity.sized) total += Math.min(identity.need ?? identity.width, (identity.indentNeed || 0) + 2 * (this.fitCh || 88)) + (identity.reserve || 0) - this.fitSize(identity, 1);
      if (identity) for (const column of shown.filter(column => hide(column, true)).sort(order))
        if (total > width) { column.fitHidden = true; total -= this.fitSize(column, 1); }
    }
  };
