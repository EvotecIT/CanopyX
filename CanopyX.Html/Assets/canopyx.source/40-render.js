
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
      this.onScroll = () => this.scheduleRender(true);
      this.onPrint = () => { this.outline.innerHTML = this.toOutline(); };
      grid.addEventListener("scroll", this.onScroll, { passive: true });
      grid.addEventListener("click", (e) => this.onClick(e));
      grid.addEventListener("dblclick", (e) => this.onDblClick(e));
      grid.addEventListener("keydown", (e) => this.onKey(e));
      // Tabbing into the grid lands on the tab-stop row; adopt it so arrows start there and recycling keeps it.
      this.canvas.addEventListener("focusin", (e) => {
        const rowEl = e.target.closest(".cx-row");
        if (rowEl && rowEl._w && this.focused !== rowEl._w) {
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
      this.cols = this.visibleColumns();
      this.columnIndex = this.cols.map((column) => this.columns.indexOf(column));
      this.grid.setAttribute("aria-colcount", String(this.cols.length));
      this.headRow.textContent = "";
      this.headCells = this.cols.map((column, i) => {
        const cell = h("div", "cx-hcell cx-kind-" + (column.kind || "text"));
        cell.setAttribute("role", "columnheader");
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
        grip.setAttribute("aria-hidden", "true");
        grip.addEventListener("pointerdown", (e) => this.startResize(e, column));
        cell.appendChild(grip);
        this.headRow.appendChild(cell);
        return cell;
      });
      this.applyWidths();
      if (focusedColumn) {
        const index = this.cols.findIndex((c) => c.id === focusedColumn);
        const button = index >= 0 ? this.headCells[index].querySelector("button") : null;
        if (button) {
          button.focus();
        }
      }
    },

    applyWidths() {
      let sum = 0;
      this.cols.forEach((column, i) => {
        this.headCells[i].style.width = column.width + "px";
        sum += column.width;
      });
      this.rowWidth = sum;
      this.headRow.style.width = sum + "px";
      this.canvas.style.width = sum + "px";
      // A new column layout makes every row rebuild its cell skeleton once.
      this.layout = (this.layout || 0) + 1;
      this.version++;
      this.scheduleRender();
    },

    startResize(e, column) {
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = column.width;
      const move = (ev) => {
        column.width = Math.max(40, w0 + ev.clientX - x0);
        this.applyWidths();
      };
      const up = () => {
        global.removeEventListener("pointermove", move);
        global.removeEventListener("pointerup", up);
      };
      global.addEventListener("pointermove", move);
      global.addEventListener("pointerup", up);
    },

    /** Renders in the next animation frame; a render requested by anything but scrolling restores DOM order at once. */
    scheduleRender(fromScroll) {
      this.renderFromScroll = !!fromScroll && (this.rafId === 0 || this.renderFromScroll);
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = 0;
          this.render(this.renderFromScroll);
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

    /**
     * Renders the rows in the viewport plus a small overscan and the focused row. A row that leaves the window is
     * reused in place for a row that enters it: it stays attached, keeps its cells, and only its content and position
     * change. Detaching and re-inserting rows (or moving them to keep DOM order) forces the browser to restyle whole
     * rows, which is what dropped frames under CPU pressure. Positions and attributes are written only when they change.
     */
    render(fromScroll) {
      if (this.destroyed) {
        return;
      }
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
      if (this.focused) {
        want.add(this.focused);
      } else {
        // Keep the DOM slots stationary and assign visible nodes in order. Moving recycled elements triggers
        // expensive subtree restyling; updating their existing cell skeletons preserves both order and reuse.
        const slots = Array.from(this.canvas.children);
        this.rendered.clear();
        let slot = 0;
        for (const w of want) {
          if (slot < slots.length) {
            this.rendered.set(w, slots[slot++]);
          }
        }
        while (slot < slots.length) {
          const rowEl = slots[slot++];
          rowEl.remove();
          rowEl._w = null;
          if (this.pool.length < 200) this.pool.push(rowEl);
        }
      }
      const free = [];
      const active = document.activeElement;
      for (const [w, rowEl] of this.rendered) {
        if (!want.has(w)) {
          this.rendered.delete(w);
          if (rowEl.contains(active)) {
            // Reusing it would leave keyboard focus on a row that now shows another node.
            rowEl.remove();
            rowEl._w = null;
          } else {
            free.push(rowEl);
          }
        }
      }
      // With nothing focused, the tab stop is the first row inside the viewport (not an overscan row).
      const tabRow = this.focused || this.rows[n ? this.rowAt(top) : 0] || null;
      const fragment = document.createDocumentFragment();
      for (const w of want) {
        const index = this.indexOf(w);
        if (index < 0) {
          continue;
        }
        let rowEl = this.rendered.get(w);
        if (!rowEl) {
          rowEl = free.pop() || this.pool.pop() || h("div");
          if (!rowEl.parentNode) {
            fragment.appendChild(rowEl);
          }
          this.rendered.set(w, rowEl);
          w._v = 0;
        }
        if (w._v !== this.version || rowEl._w !== w) {
          this.fillRow(rowEl, w);
          w._v = this.version;
        }
        const y = this.tops[index];
        if (rowEl._top !== y) {
          rowEl.style.transform = "translateY(" + y + "px)";
          rowEl._top = y;
        }
        if (rowEl._index !== index) {
          rowEl.setAttribute("aria-rowindex", String(index + 2));
          rowEl._index = index;
        }
        const alt = index % 2 === 1 && !w.status && !w.h.detail;
        if (rowEl._alt !== alt) {
          rowEl.classList.toggle("cx-alt", alt);
          rowEl._alt = alt;
        }
        const tab = w === tabRow ? 0 : -1;
        if (rowEl._tab !== tab) {
          rowEl.tabIndex = tab;
          rowEl._tab = tab;
        }
      }
      for (const rowEl of free) {
        rowEl.remove();
        rowEl._w = null;
        if (this.pool.length < 200) {
          this.pool.push(rowEl);
        }
      }
      if (fragment.childNodes.length) {
        this.canvas.appendChild(fragment);
      }
      this.window = { first: first, last: last };
      // Browse-mode assistive technology reads DOM order even while wheel or touch scrolling continues.
      this.keepDomOrder(first, last);
    },

    // Screen readers in browse mode read rows in DOM order, so rows are kept (or put back) in visual order. The focused
    // row is never moved, because moving a focused element drops its focus. After in-place reuse the DOM is usually a
    // rotation of the visual order, and moving the smaller block keeps the number of restyled rows low.
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
      const kids = Array.prototype.slice.call(this.canvas.children);
      const n = ordered.length;
      let inOrder = kids.length === n;
      for (let k = 0; inOrder && k < n; k++) {
        inOrder = kids[k] === ordered[k];
      }
      if (inOrder) {
        return;
      }
      if (kids.length === n && !focusedEl) {
        const shift = kids.indexOf(ordered[0]);
        let rotation = shift > 0;
        for (let k = 0; rotation && k < n; k++) {
          rotation = kids[(shift + k) % n] === ordered[k];
        }
        if (rotation) {
          if (shift <= n - shift) {
            for (let k = 0; k < shift; k++) {
              this.canvas.appendChild(kids[k]);
            }
          } else {
            for (let k = n - 1; k >= shift; k--) {
              this.canvas.insertBefore(kids[k], this.canvas.firstChild);
            }
          }
          return;
        }
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
