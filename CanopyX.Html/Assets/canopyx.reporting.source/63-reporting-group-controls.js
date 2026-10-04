  // ---------- flat-grid headings, summaries and keyboard traversal over projected rows ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridGroupHeading: "{column}: {value} ({count} records)", gridGroupMissing: "Missing value",
    gridGroupExpand: "Expand group", gridGroupCollapse: "Collapse group", gridSummary: "Query totals",
    gridGroupOrder: "Group order is fixed by this report"
  }));
  const GROUP_BASE = {}, GROUP_API = GRID_REPORTING.api;
  for (const name of ["buildGridControls", "buildHeader", "fillRow", "setFocus", "focusResult", "onKey", "setQuery"]) GROUP_BASE[name] = DataGrid.prototype[name];
  GRID_REPORTING.api = (api, grid) => {
    GROUP_API?.(api, grid);
    if (reportingSummaryEnabled(grid.view)) api.getSummary = () => grid.summary || null;
    if (grid.view.reporting?.grouping) {
      api.setGroupCollapsed = grid.setGroupCollapsed.bind(grid);
      api.getCollapsedGroups = () => [...(grid.collapsedGroups || [])];
    }
  };
  Object.assign(DataGrid.prototype, {
    buildHeader() {
      GROUP_BASE.buildHeader.call(this);
      const column = this.view.reporting?.grouping?.column;
      const header = this.headCells.find(cell => cell.getAttribute("data-cx-column") === column), button = header?.querySelector(".cx-sort");
      if (button) { button.disabled = true; button.title = this.labels.gridGroupOrder; }
    },
    buildGridControls() {
      GROUP_BASE.buildGridControls.call(this);
      if (!reportingSummaryEnabled(this.view)) return;
      this.summaryControls = h("div", "cx-grid-summary"); this.summaryControls.setAttribute("role", "status");
      this.summaryControls.setAttribute("aria-label", this.labels.gridSummary); this.toolbar.appendChild(this.summaryControls);
    },
    syncSummaryControls() {
      if (!this.summaryControls || !this.summary) return;
      setText(this.summaryControls, (this.view.reporting.aggregates || []).map(aggregate =>
        aggregate.label + ": " + formatValue(this.summary.aggregates[aggregate.id], "number", this.fmt)).join(" · "));
    },
    fillRow(element, row) {
      if (!row.group) { element.removeAttribute("data-cx-group"); return GROUP_BASE.fillRow.call(this, element, row); }
      element.textContent = ""; element._w = row; element._kind = "group"; element._layout = this.layout;
      element._attrs = {}; element._cls = null; element.className = "cx-row cx-grid-group";
      element.setAttribute("role", "row"); element.removeAttribute("data-cx-id"); element.removeAttribute("data-cx-status");
      element.removeAttribute("aria-selected"); element.removeAttribute("aria-busy"); element.dataset.cxGroup = row.group.key;
      element.style.height = this.rowH + "px"; element.style.width = this.rowWidth + "px";
      // A spanning heading has no column kind: sizing and pinning policies apply only to record cells.
      const cell = this.cell(element, 0, this.rowWidth), button = h("button", "cx-grid-group-toggle");
      cell.setAttribute("aria-colspan", String(this.cols.length));
      button.type = "button"; button.tabIndex = -1; const collapsed = this.collapsedGroups.has(row.group.key);
      button.disabled = !!this.pendingQuery;
      button.setAttribute("aria-expanded", String(!collapsed));
      button.setAttribute("aria-label", collapsed ? this.labels.gridGroupExpand : this.labels.gridGroupCollapse); setText(button, collapsed ? "▸" : "▾");
      button.addEventListener("click", () => { if (!this.pendingQuery) { this.setFocus(row, false); this.setGroupCollapsed(row.group.key, !this.collapsedGroups.has(row.group.key)); this.setFocus(this.focused, true); } });
      const column = this.columns.find(item => item.id === this.view.reporting.grouping.column);
      const label = fill(this.labels.gridGroupHeading, { column: column.title, value: row.group.value === null ? this.labels.gridGroupMissing : formatValue(row.group.value, column.kind, this.fmt), count: numberFormat(this.lang).format(row.group.count) });
      const text = h("span", "cx-grid-group-text"); setText(text, label); cell.append(button, text);
      const aggregates = (this.view.reporting.aggregates || []).map(item => item.label + ": " + formatValue(row.group.aggregates[item.id], "number", this.fmt)).join(" · ");
      cell.title = label + (aggregates ? " — " + aggregates : "");
      if (aggregates) { const summary = h("span", "cx-grid-group-aggregates"); setText(summary, aggregates); cell.appendChild(summary); }
      element._cells = [{ cell, content: cell }];
    },
    setQuery(input, paging) {
      const pending = GROUP_BASE.setQuery.call(this, input, paging);
      const sync = () => { if (!this.destroyed) for (const button of this.canvas.querySelectorAll(".cx-grid-group-toggle")) button.disabled = !!this.pendingQuery; };
      sync(); pending.then(sync, sync); return pending;
    },
    setFocus(row, focus) {
      if (!this.rowProjection) return GROUP_BASE.setFocus.call(this, row, focus);
      const index = this.rowProjection.indexOf(row); if (index < 0 || this.destroyed) return;
      this.pendingNavigation = null; this.focused = row;
      const top = index * this.rowH, height = this.grid.clientHeight - this.head.offsetHeight;
      if (top < this.logicalTop()) this.setLogicalTop(top);
      else if (top + this.rowH > this.logicalTop() + height) this.setLogicalTop(top + this.rowH - height);
      this.render(); if (focus) this.rendered.get(this.focused)?.focus({ preventScroll: true });
    },
    focusResult(index, focus, column, control) {
      const group = this.summary?.groups.find(group => index >= group.offset && index < group.offset + group.count);
      if (group && this.collapsedGroups?.has(group.key)) this.setGroupCollapsed(group.key, false);
      return GROUP_BASE.focusResult.call(this, index, focus, column, control);
    },
    onKey(event) {
      const row = event.target.closest(".cx-row")?._w;
      if (!row || !this.rowProjection || event.defaultPrevented || event.isComposing || event.altKey || event.target.matches(OWN_ARROWS))
        return GROUP_BASE.onKey.call(this, event);
      if (row.group && ["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
        if (event.target.closest("button") && ["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        if (this.pendingQuery) return;
        this.setGroupCollapsed(row.group.key, event.key === "ArrowLeft" ? true : event.key === "ArrowRight" ? false : !this.collapsedGroups.has(row.group.key));
        this.setFocus(this.focused, true); return;
      }
      if (row.group && ["Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.ctrlKey || event.metaKey) this.focusResult(event.key === "Home" ? 0 : this.rowCount() - 1, true)
          .catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
        else this.setFocus(row, true);
        return;
      }
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) return GROUP_BASE.onKey.call(this, event);
      const step = event.key.startsWith("Page") ? Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)) : 1;
      const index = Math.max(0, Math.min(this.rowProjection.rowCount() - 1, this.rowProjection.indexOf(row) + (/Up$/.test(event.key) ? -step : step)));
      const target = this.rowProjection.rowItem(index), cells = this.rowCells(this.rendered.get(row)), column = cells.findIndex(cell => cell.contains(event.target));
      event.preventDefault(); event.stopPropagation();
      if (target?.group) this.setFocus(target, true);
      else if (target) this.focusResult(target._ri, true, column, null).catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
    }
  });
