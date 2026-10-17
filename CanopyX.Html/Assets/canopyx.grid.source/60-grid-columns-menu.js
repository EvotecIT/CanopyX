  // ---------- Columns menu body (optional editor): find, show or hide, and reorder by handle or Alt+Up/Down ----------
  // Pinning, fitting and width live in each header's own menu, so a row here holds a handle, a checkbox and a label.
  // The editor part mixes it into DataGrid, the tree tools part into TreeGrid.
  const COLUMNS_MENU = {
    // A moved column joins the pinned group of the column it lands next to, as header moves do.
    moveColumnChoice(column, target, after) {
      column.pin = target.pin;
      const ids = this.columns.map(item => item.id).filter(id => id !== column.id);
      ids.splice(ids.indexOf(target.id) + after, 0, column.id); this.setColumnOrder(ids);
    },
    renderGridColumns(panel) {
      if (!this.columnList) {
        const find = this.columnFind = h("input", "cx-grid-column-find"), actions = h("div", "cx-grid-column-actions");
        find.type = "search"; find.placeholder = this.labels.gridFindColumn; find.setAttribute("aria-label", find.placeholder);
        find.hidden = this.columns.length < 9; find.oninput = () => this.syncColumnControls();
        actions.append(gridButton(this.labels.gridShowAllColumns, () => this.showAllColumns()), gridButton(this.labels.gridResetColumns, () => this.resetColumns()));
        panel.replaceChildren(find, this.columnList = h("div"), actions);
      }
      this.syncColumnControls();
    },
    syncColumnControls() {
      const list = this.columnList, active = document.activeElement, query = foldText(this.columnFind?.value.trim() || "");
      if (!list) return;
      const focus = list.contains(active) && active.closest(".cx-grid-column-choice").dataset.cxColumn, held = focus && active.matches(".cx-grid-column-handle"),
        last = this.columns.filter(item => !item.hidden).length < 2;
      list.textContent = "";
      for (const column of this.columns) {
        const row = h("div", "cx-grid-column-choice"), label = h("label"), input = h("input"), name = h("span", "cx-grid-column-name"), handle = h("button", "cx-grid-column-handle"),
          note = column.fitHidden || column.responsiveHidden ? this.labels.gridResponsiveHidden : column.pin === "left" ? this.labels.gridPinnedLeft : column.pin === "right" ? this.labels.gridPinnedRight : "";
        input.type = "checkbox"; input.checked = !column.hidden; input.disabled = !column.hidden && last;
        input.onchange = () => { input.focus({ preventScroll: true }); this.setColumnVisible(column.id, input.checked); };
        setText(name, name.title = column.title); handle.type = "button"; setText(handle, "⋮⋮");
        handle.setAttribute("aria-label", fill(this.labels.gridReorderColumn, { column: column.title }));
        label.append(input, name); row.append(handle, label); row.hidden = !!query && !foldText(column.title).includes(query);
        if (note) { const span = h("span", "cx-grid-column-note"); setText(span, note); row.append(span); }
        row.onkeydown = event => {
          const target = event.altKey && this.columns[this.columns.indexOf(column) + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : NaN)];
          if (target) { event.preventDefault(); event.stopPropagation(); this.moveColumnChoice(column, target, event.key === "ArrowDown"); }
        };
        handle.onpointerdown = event => {
          if (event.button) return;
          event.preventDefault(); handle.focus(); handle.setPointerCapture(event.pointerId);
          let target, after;
          const clear = () => { for (const item of list.children) item.classList.remove("cx-drop-before", "cx-drop-after"); };
          handle.onpointermove = move => {
            clear(); const over = document.elementFromPoint(move.clientX, move.clientY)?.closest(".cx-grid-column-choice");
            target = over !== row && list.contains(over) && this.columns[[...list.children].indexOf(over)];
            if (target) { const box = over.getBoundingClientRect(); after = move.clientY > box.top + box.height / 2; over.classList.add(after ? "cx-drop-after" : "cx-drop-before"); }
          };
          handle.onpointerup = handle.onpointercancel = up => {
            handle.onpointermove = handle.onpointerup = handle.onpointercancel = null; clear();
            if (up.type === "pointerup" && target) this.moveColumnChoice(column, target, after);
          };
        };
        row.dataset.cxColumn = column.id; list.appendChild(row);
        if (focus === column.id) (held ? handle : input).focus({ preventScroll: true });
      }
    }
  };
