
  // ---------- tree grid: DOM scaffold and windowed rendering ----------
  Object.assign(TreeGrid.prototype, {
    build() {
      const host = this.host;
      host.classList.add("cx-host");
      if (!host.hasAttribute("data-cx-theme")) {
        host.setAttribute("data-cx-theme", "auto");
      }
      host.style.setProperty("--cx-row-h", this.rowH + "px");
      this.setTreeColumnPinned(this.view.pinTreeColumn);
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
      this.live = h("div", "cx-live cx-sr-only");
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
          this.focused = rowEl._w;
          this.scheduleRender();
        }
      });
      // A cell scrolled to show a control it clipped starts at its first content again once focus leaves it.
      this.canvas.addEventListener("focusout", (e) => this.settleCell(e.relatedTarget));
      global.addEventListener("beforeprint", this.onPrint);
      // A link followed inside the page, or a fragment typed into the address bar, opens its row as on load.
      this.onHash = () => {
        if (this.initializing) this.linkChanged = true;
        else this.openDeepLink();
      };
      global.addEventListener("hashchange", this.onHash);
      // Detail rows keep their content inside the visible width, which the stylesheet reads from --cx-view-w.
      const viewWidth = () => { if (grid.clientWidth) host.style.setProperty("--cx-view-w", grid.clientWidth + "px"); };
      viewWidth();
      this.resizeObserver = new ResizeObserver(() => {
        viewWidth();
        this.scheduleRender();
      });
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
      const nextCols = this.visibleColumns();
      const layoutChanged = !this.cols || this.cols.length !== nextCols.length || nextCols.some((column, i) => column !== this.cols[i]);
      this.cols = nextCols;
      this.columnIndex = this.cols.map((column) => this.columns.indexOf(column));
      // Visibility changes alter the cell skeleton; width-only changes do not.
      if (layoutChanged) {
        this.layout = (this.layout || 0) + 1;
        this.version++;
      }
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

    /**
     * Renders the rows in the viewport plus a small overscan and the focused row. A row that leaves the window is
     * reused for a row that enters it: its cells survive, content is updated while detached, and it is inserted in
     * visual DOM order. Rows retained in the viewport are not repainted. Positions and attributes change only as needed.
     */
    render() {
      // A detail row that sizes itself is measured once it is in the document. A new height moves the rows below
      // it and can change which rows are in the window, so the pass repeats; heights settle within a pass or two.
      // Returns whether a height changed, so a caller that scrolled to a row can check that it is still in view.
      let measured = false;
      for (let pass = 0; !this.destroyed; pass++) {
        this.renderPass();
        if (!this.measureDetails()) break;
        measured = true;
        if (pass === 3) {
          this.scheduleRender();
          break;
        }
      }
      return measured;
    },

    renderPass() {
      if (this.destroyed) {
        return;
      }
      const grid = this.grid;
      // A repaint can replace the cell that holds focus (host-drawn cells and details are rebuilt); focus goes back.
      const held = this.heldCell();
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
      const free = [];
      const active = document.activeElement;
      for (const [w, rowEl] of this.rendered) {
        if (!want.has(w)) {
          this.rendered.delete(w);
          if (rowEl.contains(active)) {
            // Reusing it would leave keyboard focus on a row that now shows another node.
            rowEl.remove();
            rowEl._w = null;
            this.observeDetail(rowEl, false);
          } else {
            // Repaint a departing row while detached, then insert it in the new window's DOM order. Its cell
            // skeleton survives; retained rows do not need repainting or moving during downward scrolling.
            rowEl.remove();
            free.push(rowEl);
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
        } else if (!w.status) this.refreshRowState(rowEl, w);
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
        this.observeDetail(rowEl, false);
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
      if (held) this.restoreCell(held);
    }
  });
