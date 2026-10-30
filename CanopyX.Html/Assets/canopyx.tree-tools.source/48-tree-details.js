  // ---------- tree tools: hidden fields on phones and the record drawer ----------
  // As on a flat grid (76-grid-phone.js, 74-grid-record-drawer.js): on phones the tree column holds a "+N" button for the
  // columns hidden at this width or by the reader, and the button opens the node's record drawer, which shows every column
  // under its section with its tone, tooltip, badges and host or plugin renderer (drawer: false keeps a column out).
  // Fitting reserves the button's width in the tree column (20-tree-fit.js); Record details in the more menu opens the drawer
  // for the focused or selected row, and openDetails(id) for any loaded node. One tree drawer is open on a page at a time.
  // onDetails({ node, signal, returnFocus }) replaces the drawer with the host's own view. The drawer keeps the flat grid's
  // contract for parts: data-cx-field on each field, data-cx-record and data-cx-view on the dialog, dialog._cxRecord, the
  // "cx-drawer-paint" event, and the record panel part's body (RECORD_IMPL.paint) and head decoration (RECORD_IMPL.decorate).
  const TREE_DETAILS = { paintNodeRow: TreeGrid.prototype.paintNodeRow, active: null };

  Object.assign(TreeGrid.prototype, {
    // Record-panel repaints use the same input-modality focus treatment as opening and stepping a drawer.
    focusRing: focusDrawerTitle,
    hiddenFieldCount() { return this.columns.filter(column => column.hidden || column.fitHidden).length; },

    // Rows are repainted while detached (row recycling), so the button is kept by its slot, not by isConnected.
    paintNodeRow(rowEl, w) {
      TREE_DETAILS.paintNodeRow.call(this, rowEl, w);
      const slot = rowEl._cells[0], count = this.phone && this.fitReady && this.hiddenFieldCount();
      let button = slot.hiddenFields;
      if (!count) { button?.remove(); slot.hiddenFields = null; return; }
      if (!button) {
        button = slot.hiddenFields = gridButton("", () => this.openDetails(button.dataset.cxRecord).catch(error => this.emit("error", { error })));
        button.classList.add("cx-hidden-fields"); button.tabIndex = -1;
        // The row's own click (focus, selection, expansion) stays with the row.
        button.addEventListener("click", event => event.stopPropagation());
      }
      if (button.parentNode !== slot.cell) slot.cell.appendChild(button);
      button.dataset.cxRecord = w.h.id; button.setAttribute("aria-label", this.labels.gridDetails); setText(button, "+" + count);
    },

    /** Opens the record drawer of a loaded node: its label, then the other columns under their sections. */
    async openDetails(id, options) {
      const node = this.keyMap.get(id)?.h;
      if (node && this.recordNeeded(node)) await this.requirePart("record-panel");
      return this.showDetails(id, options);
    },

    showDetails(id, options = {}) {
      const rows = this.rows.filter(w => !w.status && !w.h.detail), returnFocus = options.returnFocus || document.activeElement, labels = this.labels, owner = this.dataLifetime;
      let index = rows.findIndex(w => w.key === id);
      // A node outside the visible rows (in a collapsed branch, or a record link) opens on its own, without previous and next.
      const loose = index < 0 ? options.node || this.keyMap.get(id)?.h : null;
      if (index < 0 && !loose || this.destroyed) throw new Error("CanopyX: open the details of a loaded node.");
      if (typeof this.opts.onDetails === "function") {
        const node = JSON.parse(JSON.stringify(loose || rows[index].h)), controller = new AbortController();
        owner.signal.addEventListener("abort", () => controller.abort(), { once: true });
        return Promise.resolve(this.opts.onDetails({ node, signal: controller.signal, returnFocus }));
      }
      // The drawer it replaces leaves the page at once; its close event still runs.
      if (TREE_DETAILS.active) { TREE_DETAILS.active._replaced = true; TREE_DETAILS.active._cxOverlay.close("replace", false, true); TREE_DETAILS.active.remove(); }
      const dialog = TREE_DETAILS.active = this.recordDrawer = h("dialog", "cx-host cx-tree-tools cx-drawer"), head = h("div", "cx-drawer-h"), title = h("h4"), body = h("div", "cx-drawer-body");
      dialog._returnFocus = returnFocus;
      // Nested views and host renderers inherit the theme on their first paint, before opening the dialog.
      const restoreTheme = UI_TOOLS.theme(this.host, dialog);
      dialog.dataset.hfxPart = "drawer"; dialog.dataset.side = "end"; head.dataset.hfxPart = "header"; title.dataset.hfxPart = "title"; body.dataset.hfxPart = "body";
      title.id = this.id + "-record-title"; title.tabIndex = -1; title.setAttribute("aria-level", "2"); dialog.setAttribute("aria-labelledby", title.id);
      const button = (icon, label, run) => { const item = gridDecorateButton(gridButton("", run), icon, true); item.classList.add("icon"); item.setAttribute("aria-label", labels[label]); return item; };
      const step = position => { paint(position); focusDrawerTitle(title); };
      const previous = button("up", "gridPreviousRecord", () => step(index - 1)), next = button("down", "gridNextRecord", () => step(index + 1));
      head.append(h("div"), previous, next, button("close", "gridCloseRecord", () => dialog._cxOverlay.close()));
      head.firstChild.appendChild(title); dialog.append(head, body);
      let shown = loose, paints = null;
      const paint = position => {
        if (!loose && (position < 0 || position >= rows.length)) return;
        if (!loose) { index = position; shown = rows[index].h; }
        const node = shown; paints?.abort(); paints = new AbortController();
        setText(title, node.label); dialog._cxRecord = node; dialog.setAttribute("data-cx-record", node.id); dialog.setAttribute("data-cx-view", this.view.id);
        previous.disabled = !!loose || !index; next.disabled = !!loose || index === rows.length - 1;
        this.paintDrawerBody(node, body, dialog, { index: loose ? null : index, signal: paints.signal });
        dialog.dispatchEvent(new CustomEvent("cx-drawer-paint", { detail: { id: node.id, index: loose ? null : index } }));
      };
      dialog._cxPaint = node => { shown = node; paint(index); };
      dialog.addEventListener("keydown", event => {
        if (event.defaultPrevented) return;
        if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.target.matches("input,textarea,select,[contenteditable],[role=tab]") && !event.target.closest(".cx-data-grid,.cx-record-nested")) { event.preventDefault(); step(index + (event.key === "ArrowUp" ? -1 : 1)); }
      });
      // The drawer shows the rows of one load: it closes when the tree reloads, its query changes or it is destroyed.
      const close = () => dialog._cxOverlay.close("data", false, true);
      const lifetime = new AbortController();
      owner.signal.addEventListener("abort", close, { once: true });
      dialog.addEventListener("close", () => {
        lifetime.abort(); owner.signal.removeEventListener("abort", close); paints?.abort(); dialog.remove();
        if (TREE_DETAILS.active === dialog) TREE_DETAILS.active = null;
        if (this.recordDrawer !== dialog || this.destroyed) return;
        this.recordDrawer = null;
        // Another drawer opened in its place keeps the focus.
        if (TREE_DETAILS.active || dialog._replaced || dialog._cxHidden) return;
        // Focus returns where it was while it still shows the same node, else to the node's row, else to the tree.
        const key = shown.id, row = this.rows.find(w => w.key === key);
        if (returnFocus?.isConnected && (!returnFocus.dataset.cxRecord || returnFocus.dataset.cxRecord === id)) returnFocus.focus({ preventScroll: true });
        else if (row) this.setFocus(row, true); else this.grid.focus({ preventScroll: true });
      }, { once: true });
      RECORD_IMPL.decorate?.(this, dialog, { head, identity: head.firstChild, title, body, options });
      document.body.appendChild(dialog);
      // The same full-height sheet as the grid's record drawer (see 74-grid-record-drawer.js), with the same opt-out; it closes when the tree stops rendering.
      const modal = (this.opts.recordDrawerModal ?? this.view?.recordDrawerModal) === true;
      const overlay = dialog._cxOverlay = UI_IMPL.drawer(dialog, { host: this.host, container: this.host, focus: false, dismissible: modal, modal, closeWhenHidden: true }, lifetime.signal);
      lifetime.signal.addEventListener("abort", restoreTheme, { once: true });
      paint(index); overlay.open(); focusDrawerTitle(title);
      return dialog;
    },

    // The plain body: the columns after the tree column, by section, each with its tone, tooltip, badges or renderer.
    paintDrawerBody(node, body, dialog, context) {
      if (RECORD_IMPL.paint && this.recordNeeded(node)) return RECORD_IMPL.paint(this, node, body, dialog, context);
      const sections = new Map(); body.replaceChildren();
      this.columns.forEach((column, position) => {
        if (!position || column.drawer === false) return;
        const name = column.section || this.labels.gridDetailsSection;
        if (!sections.has(name)) { const heading = h("div", "cx-drawer-s"), list = h("dl", "cx-dl"); setText(heading, name); sections.set(name, list); body.append(heading, list); }
        const term = h("dt"), value = h("dd"); setText(term, column.title);
        term.setAttribute("data-cx-field", column.id); value.setAttribute("data-cx-field", column.id);
        this.paintDrawerValue(column, node, value, position, context); sections.get(name).append(term, value);
      });
    },

    paintDrawerValue(column, node, value, position, context) {
      const cell = this.cellOf(node, column, position), object = isCellObject(cell);
      if (typeof column.render === "function") {
        try { if (column.render(node, value, { column: column.id, level: 1, expanded: false, index: position, signal: context.signal,
          onDispose: cleanup => { if (context.signal.aborted) cleanup(); else context.signal.addEventListener("abort", cleanup, { once: true }); } }) === true) return; }
        catch (error) { this.emit("error", { error }); }
      }
      const text = cellText(cell, column, this.fmt), blank = object && cell.value == null && cell.text === "", span = h("span");
      applyTone(span, "cx-drawer-text" + (text || blank ? "" : " p-missing"), toneOf(columnValueTone(column, cell) || (object ? cell.tone : null)));
      setText(span, text || blank ? text : "—"); if (object && cell.title) span.title = cell.title; value.appendChild(span);
      const rule = columnNumericTone(column, cellValue(cell));
      if (rule) { span.title = rule.label; const label = h("span", "p-sub"); setText(label, rule.label); value.appendChild(label); }
      if (object) for (const badge of cell.badges || []) value.appendChild(badgeElement(badge));
    }
  });
