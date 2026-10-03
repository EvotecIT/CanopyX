  // ---------- shared virtual rows: viewport and element reuse ----------
  // View-specific row metrics and painters stay on each view; both views share focus retention, pooling,
  // positioning and visual DOM order. Fixed-height sources can address rows without a dense wrapper array.
  const ROW_VIEWPORT = {
    scheduleRender() {
      if (this.destroyed) return;
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = 0;
          this.render();
        });
      }
    },

    renderPass() {
      if (this.destroyed) {
        return;
      }
      const grid = this.grid;
      // A repaint can replace the cell that holds focus (host-drawn cells and details are rebuilt); focus goes back.
      const held = this.heldCell();
      const viewHeight = grid.clientHeight - this.head.offsetHeight;
      const top = this.logicalTop();
      const shift = this.scaledScroll ? top - grid.scrollTop : 0;
      const n = this.rowCount();
      const over = this.lean ? 0 : OVERSCAN;
      const first = n ? Math.max(0, this.rowAt(top) - over) : 0;
      const last = n ? Math.min(n - 1, this.rowAt(top + viewHeight) + over) : -1;
      const want = new Set();
      for (let i = first; i <= last; i++) {
        want.add(this.rowItem(i));
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
      const tabRow = visibleFocus || this.rowItem(n ? this.rowAt(top) : 0) || null;
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
        const y = this.scaledScroll && (index < first || index > last) ?
          (index < first ? -w.hpx - viewHeight : NATIVE_HEIGHT + viewHeight) : this.rowTop(index) - shift;
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
      this.trimInactiveCache();
    }
  };
  Object.assign(TreeGrid.prototype, ROW_VIEWPORT);
