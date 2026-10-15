  // ---------- tree tools: hidden fields on phones and the record drawer ----------
  // As on a flat grid (76-grid-phone.js, 74-grid-record-drawer.js): on phones the tree column holds a "+N" button for the
  // columns hidden at this width or by the reader, and the button opens the node's record drawer, which shows every column.
  // Fitting reserves the button's width in the tree column (20-tree-fit.js); Record details in the more menu opens the drawer
  // for the focused or selected row, and openDetails(id) for any visible node. One tree drawer is open on a page at a time.
  const TREE_DETAILS = { paintNodeRow: TreeGrid.prototype.paintNodeRow, active: null };

  Object.assign(TreeGrid.prototype, {
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

    /** Opens the record drawer of a visible node: its label, then every other column under its section. */
    openDetails(id) { return Promise.resolve().then(() => this.showDetails(id)); },

    showDetails(id) {
      const rows = this.rows.filter(w => !w.status && !w.h.detail), returnFocus = document.activeElement, labels = this.labels, owner = this.dataLifetime;
      let index = rows.findIndex(w => w.key === id);
      if (index < 0 || this.destroyed) throw new Error("CanopyX: open the details of a visible node.");
      TREE_DETAILS.active?.close();
      const dialog = TREE_DETAILS.active = this.recordDrawer = h("dialog", "cx-host cx-tree-tools cx-drawer"), head = h("div", "cx-drawer-h"), title = h("h4"), body = h("div", "cx-drawer-body");
      dialog.setAttribute("data-cx-theme", this.host.getAttribute("data-cx-theme"));
      const theme = getComputedStyle(this.host); dialog.style.colorScheme = theme.colorScheme;
      for (const name of theme) if (name.startsWith("--cx-")) dialog.style.setProperty(name, theme.getPropertyValue(name));
      title.id = this.id + "-record-title"; title.tabIndex = -1; title.setAttribute("aria-level", "2"); dialog.setAttribute("aria-labelledby", title.id);
      const button = (icon, label, run) => { const item = gridDecorateButton(gridButton("", run), icon, true); item.classList.add("icon"); item.setAttribute("aria-label", labels[label]); return item; };
      const previous = button("up", "gridPreviousRecord", () => paint(index - 1)), next = button("down", "gridNextRecord", () => paint(index + 1));
      head.append(h("div"), previous, next, button("close", "gridCloseRecord", () => dialog.close()));
      head.firstChild.appendChild(title); dialog.append(head, body);
      const paint = position => {
        if (position < 0 || position >= rows.length) return;
        index = position; const node = rows[index].h, list = h("dl", "cx-dl"), section = h("div", "cx-drawer-s");
        setText(title, node.label); setText(section, labels.gridDetailsSection);
        previous.disabled = !index; next.disabled = index === rows.length - 1;
        this.columns.slice(1).forEach(column => {
          const term = h("dt"), value = h("dd");
          setText(term, column.title); setText(value, cellText(this.cellOf(node, column, this.columns.indexOf(column)), column, this.fmt) || "—");
          list.append(term, value);
        });
        body.replaceChildren(section, list); focusDrawerTitle(title);
      };
      dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); dialog.close(); }
        else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); paint(index + (event.key === "ArrowUp" ? -1 : 1)); }
      });
      // The drawer shows the rows of one load: it closes when the tree reloads, its query changes or it is destroyed.
      const close = () => dialog.close();
      owner.signal.addEventListener("abort", close, { once: true });
      dialog.addEventListener("close", () => {
        owner.signal.removeEventListener("abort", close); dialog.remove();
        if (TREE_DETAILS.active === dialog) TREE_DETAILS.active = null;
        if (this.recordDrawer !== dialog || this.destroyed) return;
        this.recordDrawer = null;
        // Another drawer opened in its place keeps the focus.
        if (TREE_DETAILS.active) return;
        // Focus returns where it was while it still shows the same node, else to the node's row, else to the tree.
        const key = rows[index].key, row = this.rows.find(w => w.key === key);
        if (returnFocus?.isConnected && (!returnFocus.dataset.cxRecord || returnFocus.dataset.cxRecord === id)) returnFocus.focus({ preventScroll: true });
        else if (row) this.setFocus(row, true); else this.grid.focus({ preventScroll: true });
      }, { once: true });
      document.body.appendChild(dialog);
      const phone = this.host.clientWidth <= 640;
      dialog.classList.toggle("cx-phone", phone);
      if (phone) dialog.showModal(); else dialog.show();
      paint(index);
    }
  });
