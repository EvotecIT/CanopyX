  // ---------- declarative decorations use the existing typed predicates and tone palette ----------
  function validateGridHighlights(view) {
    if (view.highlightRules === undefined) return;
    if (!Array.isArray(view.highlightRules) || view.highlightRules.length > 64) throw new Error("CanopyX: at most 64 highlight rules.");
    const columns = new Map(view.columns.map(column => [column.id, column])), budget = { predicates: 0 };
    for (const rule of view.highlightRules) {
      if (!rule ||
          rule.target !== undefined && !["row", "cell"].includes(rule.target) || rule.tone === undefined && rule.className === undefined)
        throw new Error("CanopyX: invalid highlight rule.");
      const { column, operator, values } = rule;
      if (!Object.hasOwn(GRID_FILTER_LABELS, operator)) throw new Error("CanopyX: highlight rules use built-in operators.");
      gridPredicate({ column, operator, values }, columns, budget);
      gridDecoration(rule.tone, rule.className);
    }
  }
  DataGrid.prototype.paintGridHighlights = function (element, row) {
    if (!this.view.highlightRules?.length && !row.h.tone && !row.h.className && !element._cxHighlight) return;
    const matches = new Map();
    if (!row.status) for (const rule of this.view.highlightRules || []) {
      const key = rule.target === "cell" ? rule.column : null;
      if (!matches.has(key) && gridMatches(row.h, rule, this.columns.find(column => column.id === rule.column))) matches.set(key, rule);
    }
    const mark = matches.get(null), name = row.status ? null : mark?.tone ?? row.h.tone;
    const tone = toneOf(name), classes = row.status ? "" : [row.h.className, mark?.className].filter(Boolean).join(" ");
    setClass(element, (element._cls ?? element.className) + (classes ? " " + classes : "") + tone.cls); toneColors(element, tone);
    setAttr(element, "data-cx-tone", name || null);
    if (name) element.style.setProperty("--cx-row-tone", toneVariable(name, false, "var(--hfx-color-text)"));
    else element.style.removeProperty("--cx-row-tone");
    element._cxHighlight = !!(name || classes);
    for (const [id, rule] of matches) if (id !== null) {
      const index = this.cols.findIndex(column => column.id === id), slot = element._cells[index];
      if (!slot) continue;
      const base = rule.tone ? slot.cell.className.replace(/(?:^|\s)cx-tone-[a-z0-9-]+|(?:^|\s)cx-toned/g, "") : slot.cell.className;
      slot.cell.className = base + (rule.className ? " " + rule.className : "") + (rule.tone ? toneOf(rule.tone).cls : "");
      if (rule.tone) toneColors(slot.cell, toneOf(rule.tone));
      slot.highlighted = true;
    }
  };
