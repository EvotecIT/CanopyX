
  // ---------- tree grid: detail rows ----------
  const detailColumn = { kind: "text" };
  const DETAIL_ESTIMATE_SLOTS = 16;

  function detailCell(tag, cell, fmt) {
    const element = h(tag);
    setText(element, cellText(cell, detailColumn, fmt));
    if (isCellObject(cell)) {
      if (cell.tone) {
        applyTone(element, "", toneOf(cell.tone));
      }
      if (cell.title) {
        element.title = cell.title;
      }
      (cell.badges || []).forEach((badge) => {
        const span = h("span");
        applyTone(span, "cx-badge", toneOf(badge.tone || "neutral"));
        setText(span, badge.text);
        if (badge.title) span.title = badge.title;
        element.appendChild(span);
      });
    }
    return element;
  }

  Object.assign(TreeGrid.prototype, {
    /**
     * Fills a detail row with its table, property list, or trusted host markup; a host callback can take over. The
     * content goes into a body that stays inside the visible width of the grid, however wide the columns are.
     */
    renderDetail(node, element, plainHtml = false) {
      const body = element.appendChild(h("div", "cx-detail-body"));
      if (this.opts.renderDetail && this.opts.renderDetail(node, body) === true) {
        return;
      }
      const detail = node.detail;
      if (detail.type === "table") {
        const table = h("table", "cx-detail-table");
        if (detail.caption) {
          const caption = h("caption");
          setText(caption, detail.caption);
          table.appendChild(caption);
        }
        const columns = detail.columns || [];
        const widths = Array.isArray(detail.widths) && detail.widths.length === columns.length ? detail.widths : null;
        if (widths) {
          // Shares of the table width; the table layout is fixed, so the columns keep them whatever the cells hold.
          const total = widths.reduce((sum, share) => sum + share, 0);
          const group = table.appendChild(h("colgroup"));
          widths.forEach((share) => { group.appendChild(h("col")).style.width = (share / total * 100) + "%"; });
        }
        const head = h("thead");
        const headRow = h("tr");
        columns.forEach((title) => {
          const th = h("th");
          th.scope = "col";
          setText(th, title);
          headRow.appendChild(th);
        });
        head.appendChild(headRow);
        table.appendChild(head);
        const tbody = h("tbody");
        (detail.rows || []).forEach((row) => {
          const tr = h("tr");
          row.forEach((cell) => tr.appendChild(detailCell("td", cell, this.fmt)));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        body.appendChild(table);
      } else if (detail.type === "properties") {
        const list = h("dl", "cx-props");
        (detail.items || []).forEach((item) => {
          const term = h("dt");
          setText(term, item.name);
          list.appendChild(term);
          list.appendChild(detailCell("dd", item.value, this.fmt));
        });
        body.appendChild(list);
      } else if (detail.type === "html") {
        if (plainHtml) setText(body, detail.html || "");
        else body.innerHTML = detail.html; // trusted host markup, see docs/data-protocol.md
      }
    },

    /**
     * The height a detail row starts with. A detail with a height spans that many row slots and scrolls inside them.
     * Without one the row is as tall as its content: it starts from an estimate and is measured when it is shown.
     */
    detailHeight(detail) {
      if (detail.height > 0) {
        return detail.height * this.rowH;
      }
      const slots = detail.type === "table" ? (detail.rows || []).length + (detail.caption ? 2 : 1) : detail.type === "properties" ? (detail.items || []).length : 6;
      return Math.max(1, Math.min(DETAIL_ESTIMATE_SLOTS, slots)) * this.rowH;
    },

    /** Watches the detail rows that size themselves, so a change of their content or of the grid's width is measured. */
    observeDetail(rowEl, auto) {
      if (!!rowEl._auto === auto) {
        return;
      }
      rowEl._auto = auto;
      if (!this.detailObserver) {
        this.detailObserver = new ResizeObserver(() => {
          this.measureNeeded = true;
          this.scheduleRender();
        });
      }
      if (auto) {
        this.detailObserver.observe(rowEl);
        this.measureNeeded = true;
      } else {
        this.detailObserver.unobserve(rowEl);
      }
    },

    /**
     * Reads the height of the rendered detail rows that size themselves and moves the rows below when one changed.
     * A row that ends above the viewport would push what the reader is looking at, so the scroll position follows.
     * Returns whether a height changed, in which case the window of rendered rows may have changed too.
     */
    measureDetails() {
      if (!this.measureNeeded) {
        return false;
      }
      this.measureNeeded = false;
      const top = this.grid.scrollTop;
      let shift = 0;
      let changed = false;
      for (const [w, rowEl] of this.rendered) {
        if (!w.auto || rowEl._kind !== "detail") continue;
        // offsetHeight ignores transforms on an ancestor, and is 0 while the grid is hidden: keep what was measured.
        const measured = rowEl.offsetHeight;
        const height = Math.max(this.rowH, measured);
        if (measured && height !== w.hpx) {
          if (this.tops[this.indexOf(w)] + w.hpx <= top) shift += height - w.hpx;
          w.hpx = height;
          changed = true;
        }
      }
      if (changed) {
        this.retop();
        if (shift) this.grid.scrollTop = top + shift;
      }
      return changed;
    }
  });
