  // ---------- detail rows: which records are expanded, their expanders and their rows ----------
  // A detail row belongs to a record of the accepted result and is keyed by the record's identity. Expanding asks for the
  // content once (lazily, on first expand) and keeps it while the record stays expanded, also while its row scrolls out of
  // the rendered window, so a nested grid keeps its own sort, scroll and focus. A new query keeps the expanded records it
  // still contains among its loaded rows; the others collapse.
  const DETAIL_MEASURE = DataGrid.prototype.measureGridColumn;
  Object.assign(DataGrid.prototype, {
    // The base attach of the parts: the grouping part adds its controls after this.
    attachRows() {
      if (this.rowsAttached) return;
      this.rowsAttached = true;
      this.detailRecords = new Map(); this.detailByOrdinal = new Map(); this.detailHeights = new Map(); this.detailBodies = new Map();
      this.detailOrdinals = []; this.detailVersion = 0;
      this.detailRowObserver = new ResizeObserver(() => { this.detailMeasure = true; this.scheduleRender(); });
      const width = () => { if (this.grid.clientWidth) this.host.style.setProperty("--cx-view-w", this.grid.clientWidth + "px"); };
      this.viewWidthObserver = new ResizeObserver(width); this.viewWidthObserver.observe(this.grid); width();
      this.host.classList.toggle("cx-has-details", this.detailEnabled());
    },
    detailEnabled() { return !!(this.view.reporting?.detail || this.opts.detail); },
    // The first column holds the expander beside its content.
    measureGridColumn(column) {
      const result = DETAIL_MEASURE.call(this, column);
      return this.rowsAttached && this.detailEnabled() && column === this.columns.find(item => !item.hidden && !item.responsiveHidden) && !column.fixed ?
        Object.freeze({ ...result, width: result.width + 24 }) : result;
    },
    // Whether a record offers a detail row: the host decides, then a declared payload view needs the record's payload.
    hasDetail(record) {
      if (!this.detailEnabled()) return false;
      const options = this.opts.detail || {}, declared = this.view.reporting?.detail || {};
      if (typeof options.hasDetail === "function") return options.hasDetail(record) !== false;
      if (["render", "html", "grid", "tree"].some(name => typeof options[name] === "function") || declared.template || declared.renderer ||
        typeof options.source === "function" && declared.view) return true;
      return !!record.detail && typeof record.detail === "object";
    },
    detailEstimate() { return this.rowH * 4; },
    detailKeyAt(ordinal) { return this.detailByOrdinal.get(ordinal); },
    detailItem(ordinal) { return this.detailRecords.get(this.detailByOrdinal.get(ordinal)) || null; },
    isDetailExpanded(id) { return !!this.detailRecords?.has(id); },
    syncDetailOrdinals() {
      this.detailOrdinals = [...this.detailByOrdinal.keys()].sort((a, b) => a - b);
      this.detailVersion++; this.version++;
    },
    expandDetail(id) { return this.setDetailExpanded(id, true); },
    collapseDetail(id) { return this.setDetailExpanded(id, false); },
    toggleDetail(id) { return this.setDetailExpanded(id, !this.isDetailExpanded(id)); },
    setDetailExpanded(id, expanded) {
      requireIdentifier(id, "detail row ID");
      const record = [...this.rowCache.values()].find(row => row.key === id);
      if (this.destroyed || typeof expanded !== "boolean" || !this.acceptedQuery || this.pendingQuery || !record || !this.hasDetail(record.h))
        throw new Error("CanopyX: detail rows need a loaded record of the accepted result that has details.");
      if (expanded === this.isDetailExpanded(id)) return Promise.resolve(this.detailBodies.get(id)?.ready);
      const ownedFocus = this.canvas.contains(document.activeElement), focus = this.focused;
      if (expanded) {
        this.detailRecords.set(id, { _ri: -1, hpx: this.detailEstimate(), status: "detail", h: { cells: {}, detail: true }, detailOf: id, ordinal: record._ri });
        this.detailByOrdinal.set(record._ri, id);
      } else {
        this.detailRecords.delete(id); this.detailByOrdinal.delete(record._ri); this.disposeDetail(id);
      }
      this.syncDetailOrdinals(); this.render();
      if (ownedFocus && focus && this.rowProjection.indexOf(this.focused) >= 0) this.rendered.get(this.focused)?.focus({ preventScroll: true });
      this.emit("detail", { id, expanded });
      return expanded ? this.detailContent(id, record.h).ready : Promise.resolve();
    },
    // A new accepted result keeps the expanded records it has loaded, at their new positions; the others collapse.
    resolveDetails() {
      if (this.detailSnapshot === this.snapshot) return;
      this.detailSnapshot = this.snapshot;
      if (!this.detailRecords?.size) return;
      const loaded = new Map([...this.rowCache.values()].map(row => [row.key, row._ri]));
      this.detailByOrdinal.clear();
      for (const [id, item] of [...this.detailRecords]) {
        if (loaded.has(id)) { item.ordinal = loaded.get(id); this.detailByOrdinal.set(item.ordinal, id); }
        else { this.detailRecords.delete(id); this.disposeDetail(id); }
      }
      this.syncDetailOrdinals();
    },
    // A focused row that leaves the projection hands focus to the row that now stands for it.
    relocateFocus(projection) {
      const focus = this.focused;
      if (!focus || projection.indexOf(focus) >= 0) return;
      if (focus.status === "detail") { const record = this.rowCache.get(focus.ordinal); if (record) this.focused = record; }
      else this.focusedHeader?.(projection);
    },
    fillRow(element, row) {
      if (row.status === "detail") return this.paintDetailRow(element, row);
      this.releaseDetailRow(element);
      ROWS_BASE.fillRow.call(this, element, row);
      if (this.rowsAttached && !row.status && element._kind === "node") this.paintExpander(element, row);
    },
    // The expander leads the first cell. It is a button reached with cell navigation (Enter or F2, then the arrows);
    // Enter and Space press it. Its aria-expanded tells whether the detail row follows the record.
    paintExpander(element, row) {
      const slot = element._cells?.[0];
      if (!slot) return;
      const offered = this.hasDetail(row.h), expanded = offered && this.isDetailExpanded(row.key);
      let button = slot.detailToggle;
      if (!offered) { button?.remove(); slot.detailToggle = null; element.removeAttribute("aria-expanded"); return; }
      if (!button) {
        button = h("button", "cx-detail-toggle"); button.type = "button"; button.tabIndex = -1;
        button.addEventListener("click", event => {
          event.stopPropagation();
          const record = button.closest(".cx-row")?._w;
          if (record && !record.status && !this.pendingQuery) Promise.resolve().then(() => this.toggleDetail(record.key)).catch(error => this.emit("error", { error }));
        });
        slot.detailToggle = button;
      }
      if (button.parentNode !== slot.cell || slot.cell.firstChild !== button) slot.cell.prepend(button);
      button.setAttribute("aria-expanded", String(expanded)); button.disabled = !!this.pendingQuery;
      const label = expanded ? this.labels.gridHideDetail : this.labels.gridShowDetail;
      if (button.getAttribute("aria-label") !== label) { button.setAttribute("aria-label", label); button.title = label; }
    },
    paintDetailRow(element, row) {
      const entry = this.detailContent(row.detailOf, this.rowCache.get(row.ordinal)?.h);
      element._w = row;
      if (element._kind !== "detail" || element._detail !== entry) {
        disposeRowHostCells(element); this.releaseDetailRow(element);
        element.textContent = ""; element._kind = "detail"; element._layout = this.layout; element._attrs = {}; element._cls = null;
        element.className = "cx-row cx-detail cx-detail-auto cx-detail-row"; element.setAttribute("role", "row");
        for (const name of ["data-cx-id", "data-cx-status", "aria-selected", "aria-busy", "data-cx-group", "aria-expanded"]) element.removeAttribute(name);
        const cell = h("div", "cx-cell cx-detail-cell"); cell.setAttribute("role", "gridcell");
        cell.appendChild(entry.body); element.appendChild(cell); element._cells = [{ cell, content: cell }]; element._detail = entry;
        this.detailRowObserver.observe(element); this.detailMeasure = true;
      }
      const cell = element._cells[0].cell;
      cell.id = this.id + "-detail-" + entry.slot;
      cell.setAttribute("aria-colspan", String(this.cols.length));
      element.dataset.cxDetail = row.detailOf; element.style.height = "auto"; element.style.width = this.rowWidth + "px";
    },
    releaseDetailRow(element) {
      if (element._kind !== "detail") return;
      this.detailRowObserver?.unobserve(element);
      element._detail?.body.remove(); element._detail = null; element._kind = null; element._cells = null;
      element.classList.remove("cx-detail", "cx-detail-auto", "cx-detail-row"); element.removeAttribute("data-cx-detail"); element.style.height = this.rowH + "px";
    },
    destroy() {
      if (!this.destroyed) {
        for (const id of [...(this.detailBodies?.keys() || [])]) this.disposeDetail(id);
        this.detailRowObserver?.disconnect(); this.viewWidthObserver?.disconnect();
      }
      return ROWS_BASE.destroy.call(this);
    }
  });
