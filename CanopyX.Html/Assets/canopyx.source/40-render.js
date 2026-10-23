
  // ---------- tree grid: DOM scaffold and windowed rendering ----------
  Object.assign(TreeGrid.prototype, {
    build() {
      const host = this.host;
      host.classList.add("cx-host");
      watchTheme(host, this.lifetime.signal);
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
      this.onScroll = () => { this.scheduleRender(); this.stateChanged(); };
      this.onPrint = () => { const table = this.outlineElement(); this.outline.replaceChildren(...table ? [table] : []); };
      grid.addEventListener("scroll", this.onScroll, { passive: true });
      grid.addEventListener("click", (e) => this.onClick(e));
      grid.addEventListener("dblclick", (e) => this.onDblClick(e));
      grid.addEventListener("pointerover", (e) => this.cellTip(e));
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
      // A link followed inside the page, a fragment typed into the address bar, Back and Forward, or a router that
      // announces its own address change with popstate open their row as on load. A host that changes the address
      // itself with replaceState or pushState, which fire neither event, calls readLocation.
      this.onHash = (e) => {
        // Following a fragment fires popstate and then hashchange for the same address: one navigation, read once, so
        // a fragment that fails to open is not tried and announced twice.
        const href = global.location.href;
        const last = this.locationEvent;
        this.locationEvent = last && last.href === href && last.type !== e.type ? null : { href, type: e.type };
        if (this.locationEvent) this.readLocation();
      };
      global.addEventListener("hashchange", this.onHash);
      global.addEventListener("popstate", this.onHash);
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
        if (column.headerDescription) cell.setAttribute("aria-description", column.headerDescription);
        cell.title = column.headerDescription ?? column.title;
        cell.setAttribute("data-cx-column", column.id);
        cell.setAttribute("aria-colindex", String(i + 1));
        if (column.sortable) {
          const sorted = this.sortState && this.sortState.column === column.id ? this.sortState.direction : null;
          cell.setAttribute("aria-sort", sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none");
          const button = h("button", "cx-sort");
          button.type = "button";
          button.title = column.headerDescription ?? column.title;
          setText(button, column.title);
          button.addEventListener("click", (event) => this.queryAware ? this.querySortHeader(column.id, event) : this.sort(column.id, sorted === "asc" ? "desc" : sorted === "desc" ? null : "asc"));
          cell.appendChild(button);
        } else {
          const title = h("span", "cx-htext");
          title.title = column.headerDescription ?? column.title;
          setText(title, column.title);
          cell.appendChild(title);
        }
        const grip = h("span", "cx-resize");
        grip.setAttribute("aria-label", fill(this.labels.resizeColumn, { column: column.title }));
        grip.tabIndex = 0;
        grip.setAttribute("role", "separator");
        grip.setAttribute("aria-orientation", "vertical");
        grip.setAttribute("aria-valuemin", column.minW);
        grip.setAttribute("aria-valuemax", column.maxW);
        grip.addEventListener("keydown", (e) => {
          if (!["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          column.width = columnWidth(column, e.key === "Home" ? 40 : column.width + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 50 : 10));
          this.applyWidths();
          this.stateChanged();
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

    rowCount() { return this.rows.length; },
    rowItem(index) { return this.rows[index]; },
    rowTop(index) { return this.tops[index]; },

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
    }
  });
