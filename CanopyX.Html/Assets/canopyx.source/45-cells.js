
  // ---------- tree grid: row and cell painting ----------
  Object.assign(TreeGrid.prototype, {
    /** Paints a row for a node or a status row. The row element may be recycled from another node. */
    fillRow(rowEl, w) {
      const node = w.h;
      rowEl._w = w;
      rowEl._expander = null;
      rowEl.className = "cx-row";
      rowEl.textContent = "";
      rowEl.setAttribute("role", "row");
      rowEl.setAttribute("aria-level", String(w.level));
      ["aria-expanded", "aria-busy", "aria-setsize", "aria-posinset", "aria-selected", "data-cx-id", "data-cx-status", "data-kind"].forEach((name) => rowEl.removeAttribute(name));
      rowEl.style.height = w.span * this.rowH + "px";
      rowEl.style.width = this.rowWidth + "px";
      if (w.status) {
        this.fillStatusRow(rowEl, w);
        return;
      }
      rowEl.setAttribute("data-cx-id", node.id);
      if (node.kind) {
        rowEl.setAttribute("data-kind", node.kind);
      }
      if (node.group) {
        rowEl.classList.add("cx-group");
      }
      if (node.className) {
        node.className.split(/\s+/).filter(Boolean).forEach((name) => rowEl.classList.add(name));
      }
      this.setPosition(rowEl, w);
      rowEl.setAttribute("aria-selected", this.selected.has(w) ? "true" : "false");
      if (node.detail) {
        rowEl.classList.add("cx-detail");
        const cell = this.cell(rowEl, 0, this.rowWidth);
        cell.setAttribute("aria-colspan", String(this.cols.length));
        cell.style.paddingLeft = (w.level - 1) * INDENT + 8 + "px";
        this.renderDetail(node, cell);
        return;
      }
      if (this.expandable(w)) {
        rowEl.setAttribute("aria-expanded", w._open ? "true" : "false");
      }
      if (w.loading) {
        rowEl.setAttribute("aria-busy", "true");
      }
      this.cols.forEach((column, i) => {
        const cell = this.cell(rowEl, i, column.width, column.kind);
        const content = i === 0 ? this.treeCell(cell, w) : cell;
        this.paintCell(content, cell, node, column, this.columnIndex[i], w);
      });
    },

    fillStatusRow(rowEl, w) {
      rowEl.classList.add("cx-status", "cx-" + w.status);
      rowEl.setAttribute("data-cx-status", w.status);
      const cell = this.cell(rowEl, 0, this.rowWidth);
      cell.setAttribute("aria-colspan", String(this.cols.length));
      cell.appendChild(this.indent(w.level));
      const label = h("span", w.status === "more" ? "cx-more-btn" : "cx-status-text");
      setText(label, w.h.label);
      cell.appendChild(label);
    },

    /** Updates paging metadata without replacing a retained host control or its DOM state. */
    refreshRowState(rowEl, w) {
      const expanded = this.expandable(w) ? (w._open ? "true" : "false") : null;
      if (expanded === null) rowEl.removeAttribute("aria-expanded");
      else if (rowEl.getAttribute("aria-expanded") !== expanded) rowEl.setAttribute("aria-expanded", expanded);
      const busy = w.loading ? "true" : null;
      if (busy === null) rowEl.removeAttribute("aria-busy");
      else if (rowEl.getAttribute("aria-busy") !== busy) rowEl.setAttribute("aria-busy", busy);
      this.setPosition(rowEl, w);
      if (rowEl._expander) rowEl._expander.classList.toggle("cx-leaf", !this.expandable(w));
    },

    /**
     * aria-posinset is the position among the visible siblings in display (sorted) order. aria-setsize counts children
     * that are not loaded yet; -1 means the total is unknown.
     */
    setPosition(rowEl, w) {
      const parent = w.parent;
      const loaded = parent.children ? parent.children.length : 0;
      const size = parent.childrenFiltered ? parent.visibleCount : parent.total != null ? Math.max(parent.total, loaded) : parent.next ? -1 : loaded;
      rowEl.setAttribute("aria-setsize", String(size));
      rowEl.setAttribute("aria-posinset", String(w.pos));
    },

    cell(rowEl, index, width, kind) {
      const cell = h("div", "cx-cell" + (kind ? " cx-kind-" + kind : ""));
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(index + 1));
      cell.style.width = width + "px";
      rowEl.appendChild(cell);
      return cell;
    },

    indent(level) {
      const span = h("span", "cx-indent");
      span.style.width = (level - 1) * INDENT + "px";
      return span;
    },

    /** Builds the tree column's indent, expander, and icon; returns the element that holds the label. */
    treeCell(cell, w) {
      cell.classList.add("cx-tree");
      cell.appendChild(this.indent(w.level));
      const expander = h("span", "cx-exp" + (this.expandable(w) ? "" : " cx-leaf"));
      expander.setAttribute("aria-hidden", "true");
      cell.appendChild(expander);
      cell.parentNode._expander = expander;
      const template = w.h.icon ? this.iconTemplates.get(w.h.icon) : null;
      if (template) {
        cell.appendChild(template.cloneNode(true));
      }
      const content = h("span", "cx-content");
      cell.appendChild(content);
      return content;
    },

    paintCell(content, cell, node, column, index, w) {
      const value = this.cellOf(node, column, index);
      if (this.opts.renderCell && this.opts.renderCell(node, column.id, content, { level: w.level, expanded: w.expanded, index: index }) === true) {
        return;
      }
      const text = h("span", "cx-text");
      setText(text, cellText(value, column, this.lang));
      content.appendChild(text);
      if (isCellObject(value)) {
        if (value.tone) {
          cell.classList.add("cx-tone-" + value.tone);
        }
        if (value.title) {
          cell.title = value.title;
        }
      }
      const badges = (index === 0 && node.badges ? node.badges : []).concat(isCellObject(value) && value.badges ? value.badges : []);
      badges.forEach((badge) => content.appendChild(this.badge(badge)));
    },

    badge(badge) {
      const span = h("span", "cx-badge cx-tone-" + (badge.tone || "neutral"));
      setText(span, badge.text);
      if (badge.title) {
        span.title = badge.title;
      }
      return span;
    }
  });
