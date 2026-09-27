
  // ---------- tree grid: DOM scaffold and windowed rendering ----------
  Object.assign(TreeGrid.prototype, {
    build() {
      const host = this.host;
      host.classList.add("cx-host");
      if (!host.hasAttribute("data-cx-theme")) {
        host.setAttribute("data-cx-theme", "auto");
      }
      host.style.setProperty("--cx-row-h", this.rowH + "px");
      this.toolbar = h("div", "cx-toolbar");
      this.toolbar.hidden = true;
      const grid = this.grid = h("div", "cx-grid");
      grid.id = this.id;
      grid.setAttribute("role", "treegrid");
      grid.setAttribute("aria-label", this.view.label);
      if (this.multi) {
        grid.setAttribute("aria-multiselectable", "true");
      }
      this.head = h("div", "cx-head");
      this.head.setAttribute("role", "rowgroup");
      this.headRow = h("div", "cx-hrow");
      this.headRow.setAttribute("role", "row");
      this.headRow.setAttribute("aria-rowindex", "1");
      this.head.appendChild(this.headRow);
      this.canvas = h("div", "cx-canvas");
      this.canvas.setAttribute("role", "rowgroup");
      grid.appendChild(this.head);
      grid.appendChild(this.canvas);
      this.live = h("div", "cx-sr-only");
      this.live.setAttribute("aria-live", "polite");
      this.outline = h("div", "cx-outline");
      host.appendChild(this.toolbar);
      host.appendChild(grid);
      host.appendChild(this.live);
      host.appendChild(this.outline);
      this.buildHeader();
      this.onScroll = () => this.scheduleRender();
      this.onPrint = () => { this.outline.innerHTML = this.toOutline(); };
      grid.addEventListener("scroll", this.onScroll, { passive: true });
      grid.addEventListener("click", (e) => this.onClick(e));
      grid.addEventListener("dblclick", (e) => this.onDblClick(e));
      grid.addEventListener("keydown", (e) => this.onKey(e));
      // Tabbing into the grid lands on the tab-stop row; adopt it so arrows start there and recycling keeps it.
      this.canvas.addEventListener("focusin", (e) => {
        const rowEl = e.target.closest(".cx-row");
        if (rowEl && rowEl._w && this.focused !== rowEl._w) {
          this.focusRevision = (this.focusRevision || 0) + 1;
          if (this.focused) {
            this.focused._v = 0;
          }
          this.focused = rowEl._w;
        }
      });
      global.addEventListener("beforeprint", this.onPrint);
      this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
      this.resizeObserver.observe(grid);
    },

    visibleColumns() {
      return this.columns.filter((column) => !column.hidden);
    },

    buildHeader() {
      // Rebuilding the header replaces its buttons; keep keyboard focus on the same column's sort button.
      const active = document.activeElement;
      const focusedColumn = active && this.headRow.contains(active) ? active.closest(".cx-hcell").getAttribute("data-cx-column") : null;
      const focusedResize = active && active.classList.contains("cx-resize");
      this.cols = this.visibleColumns();
      this.grid.setAttribute("aria-colcount", String(this.cols.length));
      this.headRow.textContent = "";
      this.headCells = this.cols.map((column, i) => {
        const cell = h("div", "cx-hcell cx-kind-" + (column.kind || "text"));
        cell.setAttribute("role", "columnheader");
        cell.setAttribute("aria-label", column.title);
        cell.setAttribute("data-cx-column", column.id);
        cell.setAttribute("aria-colindex", String(i + 1));
        if (column.sortable) {
          const sorted = this.sortState && this.sortState.column === column.id ? this.sortState.direction : null;
          cell.setAttribute("aria-sort", sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none");
          const button = h("button", "cx-sort");
          button.type = "button";
          setText(button, column.title);
          button.addEventListener("click", () => this.sort(column.id, sorted === "asc" ? "desc" : sorted === "desc" ? null : "asc"));
          cell.appendChild(button);
        } else {
          const title = h("span", "cx-htext");
          setText(title, column.title);
          cell.appendChild(title);
        }
        const grip = h("span", "cx-resize");
        grip.tabIndex = 0;
        grip.setAttribute("role", "separator");
        grip.setAttribute("aria-orientation", "vertical");
        grip.setAttribute("aria-valuemin", "40");
        grip.setAttribute("aria-valuemax", String(MAX_COLUMN_WIDTH));
        grip.addEventListener("keydown", (e) => {
          if (!["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          column.width = e.key === "Home" ? 40 : Math.min(MAX_COLUMN_WIDTH, Math.max(40, column.width + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 50 : 10)));
          this.applyWidths();
        });
        grip.addEventListener("pointerdown", (e) => this.startResize(e, column));
        cell.appendChild(grip);
        this.headRow.appendChild(cell);
        return cell;
      });
      this.applyWidths();
      if (focusedColumn) {
        const index = this.cols.findIndex((c) => c.id === focusedColumn);
        const button = index >= 0 ? this.headCells[index].querySelector(focusedResize ? ".cx-resize" : ".cx-sort") : null;
        if (button) {
          button.focus();
        }
      }
    },

    scheduleRender() {
      if (this.destroyed) return;
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = 0;
          this.render();
        });
      }
    },

    rowAt(y) {
      const tops = this.tops;
      let lo = 0;
      let hi = this.rows.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (tops[mid] <= y) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return Math.max(0, lo);
    },

    indexOf(w) {
      const i = w ? w._ri : undefined;
      return i !== undefined && this.rows[i] === w ? i : -1;
    },

    render() {
      const grid = this.grid;
      const viewHeight = grid.clientHeight - this.head.offsetHeight;
      const top = grid.scrollTop;
      const n = this.rows.length;
      const first = n ? Math.max(0, this.rowAt(top) - OVERSCAN) : 0;
      const last = n ? Math.min(n - 1, this.rowAt(top + viewHeight) + OVERSCAN) : -1;
      const want = new Set();
      for (let i = first; i <= last; i++) {
        want.add(this.rows[i]);
      }
      const visibleFocus = this.indexOf(this.focused) >= 0 ? this.focused : null;
      if (visibleFocus) {
        want.add(visibleFocus);
      }
      for (const [w, rowEl] of this.rendered) {
        if (!want.has(w)) {
          this.rendered.delete(w);
          rowEl.remove();
          if (this.pool.length < 200) {
            this.pool.push(rowEl);
          }
        }
      }
      // With nothing focused, the tab stop is the first row inside the viewport (not an overscan row).
      const tabRow = visibleFocus || this.rows[n ? this.rowAt(top) : 0] || null;
      const fragment = document.createDocumentFragment();
      for (const w of want) {
        const index = this.indexOf(w);
        if (index < 0) {
          continue;
        }
        let rowEl = this.rendered.get(w);
        if (!rowEl) {
          rowEl = this.pool.pop() || h("div");
          this.rendered.set(w, rowEl);
          w._v = 0;
          fragment.appendChild(rowEl);
        }
        if (w._v !== this.version || rowEl._w !== w) {
          this.fillRow(rowEl, w);
          w._v = this.version;
        } else if (!w.status) this.refreshRowState(rowEl, w);
        rowEl.style.transform = "translateY(" + this.tops[index] + "px)";
        rowEl.setAttribute("aria-rowindex", String(index + 2));
        rowEl.classList.toggle("cx-alt", index % 2 === 1 && !w.status && !w.h.detail);
        rowEl.tabIndex = w === tabRow ? 0 : -1;
      }
      if (fragment.childNodes.length) {
        this.canvas.appendChild(fragment);
      }
      this.keepDomOrder(first, last);
    },

    // Screen readers in browse mode read rows in DOM order, so recycled rows are kept in visual order. The focused
    // row is never moved, because moving a focused element drops its focus.
    keepDomOrder(first, last) {
      const ordered = [];
      const focusedIndex = this.focused ? this.indexOf(this.focused) : -1;
      const focusedEl = focusedIndex >= 0 ? this.rendered.get(this.focused) : null;
      if (focusedEl && focusedIndex < first) {
        ordered.push(focusedEl);
      }
      for (let i = first; i <= last; i++) {
        const rowEl = this.rendered.get(this.rows[i]);
        if (rowEl) {
          ordered.push(rowEl);
        }
      }
      if (focusedEl && focusedIndex > last) {
        ordered.push(focusedEl);
      }
      const kids = this.canvas.children;
      let inOrder = kids.length === ordered.length;
      for (let k = 0; inOrder && k < ordered.length; k++) {
        inOrder = kids[k] === ordered[k];
      }
      if (inOrder) {
        return;
      }
      const p = focusedEl ? ordered.indexOf(focusedEl) : -1;
      if (p < 0) {
        let node = this.canvas.firstChild;
        for (const rowEl of ordered) {
          if (node === rowEl) {
            node = node.nextSibling;
          } else {
            this.canvas.insertBefore(rowEl, node);
          }
        }
        return;
      }
      let ref = focusedEl;
      for (let k = p - 1; k >= 0; k--) {
        if (ordered[k].nextSibling !== ref) {
          this.canvas.insertBefore(ordered[k], ref);
        }
        ref = ordered[k];
      }
      let prev = focusedEl;
      for (let k = p + 1; k < ordered.length; k++) {
        if (prev.nextSibling !== ordered[k]) {
          this.canvas.insertBefore(ordered[k], prev.nextSibling);
        }
        prev = ordered[k];
      }
    }
  });
