  // ---------- matrix: windowed painting of the header, the rows and the totals ----------
  // Only the rows and columns that meet the viewport (plus an overscan, plus the focused cell) are mounted. Rows are pooled
  // and placed with transforms; each draws its window of cells on its canvas (47-matrix-canvas.js), and the header and totals
  // are elements placed at inline-start offsets. A derive drops the mounted rows and the next frame paints anew.
  Object.assign(MatrixView.prototype, {
    scheduleRender() {
      if (this.destroyed || this.frame) return;
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
    },
    recycleAll() {
      this.lookCache = null;
      for (const row of this.rowsMounted.values()) this.releaseRow(row);
      this.rowsMounted.clear();
      for (const map of [this.headMounted, this.footMounted, this.bandMounted]) { for (const element of map.values()) element.remove(); map.clear(); }
    },
    releaseRow(row) {
      row.remove(); row._key = null;
      if (this.rowPool.length < 200) this.rowPool.push(row);
    },
    windows() {
      const scroll = this.scroll, viewH = Math.max(this.rowH, scroll.clientHeight - this.headH - this.bandH - this.footH), viewW = Math.max(this.cellW, scroll.clientWidth - this.rowHeadW - this.totalW);
      const rows = this.rowWindow.window(scroll.scrollTop, viewH, MATRIX_OVERSCAN), columns = this.columnWindow.window(Math.abs(scroll.scrollLeft), viewW, MATRIX_OVERSCAN);
      return { rows, columns, viewH, viewW };
    },
    render() {
      if (this.destroyed || this.scroll.hidden) return;
      const { rows, columns } = this.windows(), model = this.model, focus = this.focus, scroll = this.scroll, top = scroll.scrollTop;
      const below = scroll.scrollHeight - scroll.clientHeight - top > 1;
      this.head.classList.toggle("cx-mx-raised", top > 0); this.foot.classList.toggle("cx-mx-raised", below);
      const columnList = [];
      for (let c = columns.first; c <= columns.last; c++) columnList.push(c);
      if (focus.column >= 0 && focus.column < model.columns.length && (focus.column < columns.first || focus.column > columns.last)) columnList.push(focus.column);
      const rowList = [];
      for (let r = rows.first; r <= rows.last; r++) rowList.push(r);
      if (focus.row >= 0 && focus.row < model.rows.length && (focus.row < rows.first || focus.row > rows.last)) rowList.push(focus.row);
      this.paintHeader(columnList); this.paintBand(columns); this.placeBands(); this.paintFoot(columnList);
      const keep = new Set();
      for (const r of rowList) {
        const entry = model.rows[r];
        if (!entry) continue;
        keep.add(entry.key);
        let row = this.rowsMounted.get(entry.key);
        if (!row) { row = this.rowPool.pop() || this.newRow(); this.rowsMounted.set(entry.key, row); this.fillRow(row, entry, r); this.body.appendChild(row); }
        else if (row._index !== r) this.placeRow(row, r);
        this.drawRow(row, entry, columns.first, entry.kind === "heading" ? -1 : columns.last);
      }
      for (const [key, row] of this.rowsMounted) if (!keep.has(key)) { this.releaseRow(row); this.rowsMounted.delete(key); }
      this.syncTabStop();
    },
    newRow() {
      const row = h("div", "cx-mx-row"), head = h("div", "cx-mx-rowhead"), spacer = h("div", "cx-mx-spacer"), total = h("div", "cx-mx-total");
      row.setAttribute("role", "row"); head.setAttribute("role", "rowheader"); head.setAttribute("aria-colindex", "1"); total.setAttribute("role", "gridcell");
      row.append(head, spacer, total); row._head = head; row._total = total;
      return row;
    },
    placeRow(row, r) {
      row._index = r; row.style.transform = "translateY(" + this.rowWindow.offset(r) + "px)";
      row.setAttribute("aria-rowindex", String(r + (this.bandH ? 3 : 2)));
      row._head._r = r; row._total._r = r;
    },
    fillRow(row, entry, r) {
      row._key = entry.key; row._entry = entry; this.placeRow(row, r);
      row.className = "cx-mx-row" + (entry.kind === "heading" ? " cx-mx-heading" : entry.kind === "rollup" ? " cx-mx-rolledrow" : entry.band ? " cx-mx-member" : "");
      const head = row._head, labels = this.labels;
      head.replaceChildren(); head._c = -1; head.tabIndex = -1;
      if (entry.kind === "item") {
        const item = entry.item, text = item.href ? h("a", "cx-mx-label cx-link") : h("span", "cx-mx-label");
        if (item.href) { text.href = item.href; text.tabIndex = -1; }
        setText(text, item.label); head.appendChild(text);
        if (item.secondary) { const sub = h("span", "cx-mx-sub"); setText(sub, item.secondary); head.appendChild(sub); }
        head.title = item.secondary ? item.label + " — " + item.secondary : item.label;
      } else {
        const toggle = h("button", "cx-mx-toggle"), open = entry.kind === "heading";
        toggle.type = "button"; toggle.tabIndex = -1; toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", fill(open ? labels.matrixCollapseGroup : labels.matrixExpandGroup, { group: entry.label }));
        toggle._group = { axis: "rows", key: entry.group.key };
        const label = h("span", "cx-mx-label"), count = h("span", "cx-mx-sub");
        setText(label, entry.label); setText(count, fill(labels.matrixGroupHeadingCount, { count: this.format.format(entry.members.length) }));
        toggle.append(label, count); head.appendChild(toggle);
        head.removeAttribute("title");
      }
      const total = row._total; total.hidden = !this.totalW;
      if (this.totalW) this.paintTotal(total, entry, r, this.model.columns.length);
    },
    paintTotal(element, entry, r, c) {
      const value = entry.total || 0;
      setText(element, this.format.format(value));
      element.classList.toggle("cx-mx-zero", !value);
      element.setAttribute("aria-label", fill(this.labels.matrixItemTotal, { item: entry.label, count: this.format.format(value) }));
      element._r = r; element._c = c; element.tabIndex = -1;
      element.setAttribute("aria-colindex", String(this.model.columns.length + 2));
    },
    paintHeader(columnList) {
      const wanted = new Set(columnList), mounted = this.headMounted, model = this.model;
      for (const [c, element] of mounted) if (!wanted.has(c) || element._key !== model.columns[c]?.key) { element.remove(); mounted.delete(c); }
      for (const c of columnList) {
        const entry = model.columns[c];
        if (!entry || mounted.has(c)) continue;
        const element = h("div", "cx-mx-hcell" + (entry.kind === "rollup" ? " cx-mx-rolledcol" : ""));
        element.setAttribute("role", "columnheader"); element.setAttribute("aria-colindex", String(c + 2));
        element.style.insetInlineStart = this.rowHeadW + this.columnWindow.offset(c) + "px";
        element._r = -1; element._c = c; element._key = entry.key; element.tabIndex = -1;
        if (entry.kind === "rollup") {
          const toggle = h("button", "cx-mx-toggle"); toggle.type = "button"; toggle.tabIndex = -1; toggle.setAttribute("aria-expanded", "false");
          toggle.setAttribute("aria-label", fill(this.labels.matrixExpandGroup, { group: entry.label })); toggle._group = { axis: "columns", key: entry.group.key };
          const text = h("span", "cx-mx-vlabel"); setText(text, entry.label); toggle.appendChild(text); element.appendChild(toggle);
        } else {
          const item = entry.item, text = h(item.href ? "a" : "span", "cx-mx-vlabel" + (item.href ? " cx-link" : ""));
          if (item.href) { text.href = item.href; text.tabIndex = -1; }
          setText(text, item.label); element.appendChild(text);
          element.title = item.secondary ? item.label + " — " + item.secondary : item.label;
        }
        mounted.set(c, element); this.headRow.appendChild(element);
      }
    },
    paintBand(columns) {
      const mounted = this.bandMounted, model = this.model;
      if (!this.bandH) return;
      const seen = new Set();
      for (let c = columns.first; c <= columns.last && c >= 0; c++) {
        const entry = model.columns[c];
        if (!entry || !entry.band || seen.has(entry.band.key)) continue;
        seen.add(entry.band.key);
        if (mounted.has(entry.band.key)) continue;
        const band = entry.band, first = model.columns.findIndex(item => item.band === band), element = h("div", "cx-mx-bcell");
        element._from = this.columnWindow.offset(first); element._width = band.members.length * this.cellW;
        element.style.insetInlineStart = this.rowHeadW + element._from + "px"; element.style.width = element._width + "px";
        element.setAttribute("role", "columnheader"); element.setAttribute("aria-colindex", String(first + 2)); element.setAttribute("aria-colspan", String(band.members.length));
        // The band's button takes no tab stop: the grid keeps one, and Enter on a column header rolls its group up.
        const toggle = h("button", "cx-mx-toggle"); toggle.type = "button"; toggle.tabIndex = -1; toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", fill(this.labels.matrixCollapseGroup, { group: band.label })); toggle._group = { axis: "columns", key: band.key };
        const text = h("span", "cx-mx-label"); setText(text, band.label); toggle.appendChild(text); element.appendChild(toggle);
        // A narrow band shortens its name; the whole name is its tooltip.
        element.title = band.label;
        mounted.set(band.key, element); this.band.appendChild(element);
      }
      for (const [key, element] of mounted) if (!seen.has(key)) { element.remove(); mounted.delete(key); }
    },
    /** A band's name starts where the band meets the view, so a band scrolled under the row headers still names itself; a band
     *  cut to a sliver at the edge shows no name rather than a lone arrow; a narrow band wholly in view keeps its button. */
    placeBands() {
      if (!this.bandH) return;
      const start = Math.abs(this.scroll.scrollLeft), end = start + Math.max(0, this.scroll.clientWidth - this.rowHeadW - this.totalW);
      for (const element of this.bandMounted.values()) {
        const from = element._from, shown = Math.min(end, from + element._width) - Math.max(start, from), toggle = element.firstChild;
        toggle.style.marginInlineStart = Math.max(0, start - from) + "px"; toggle.style.maxWidth = Math.max(0, shown - 8) + "px";
        element.classList.toggle("cx-mx-bclip", shown < Math.min(40, element._width));
      }
    },
    paintFoot(columnList) {
      if (!this.footH) return;
      const wanted = new Set(columnList), mounted = this.footMounted, model = this.model, rows = model.rows.length + (this.bandH ? 3 : 2);
      this.footRow.setAttribute("aria-rowindex", String(rows));
      for (const [c, element] of mounted) if (!wanted.has(c) || element._key !== model.columns[c]?.key) { element.remove(); mounted.delete(c); }
      for (const c of columnList) {
        const entry = model.columns[c];
        if (!entry || mounted.has(c)) continue;
        const element = h("div", "cx-mx-fcell");
        element.setAttribute("role", "gridcell"); element.style.insetInlineStart = this.rowHeadW + this.columnWindow.offset(c) + "px";
        this.paintTotal(element, entry, model.rows.length, c); element.setAttribute("aria-colindex", String(c + 2)); element._key = entry.key;
        mounted.set(c, element); this.footRow.appendChild(element);
      }
      if (this.totalW) this.paintTotal(this.footGrand, { label: this.labels.matrixTotal, total: model.grandTotal }, model.rows.length, model.columns.length);
      this.footHeader._r = model.rows.length; this.footHeader._c = -1;
    }
  });
