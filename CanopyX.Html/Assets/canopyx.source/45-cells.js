
  // ---------- tree grid: row and cell painting ----------
  // A row element keeps a skeleton of cells for the current column layout. Recycling it for another node only updates
  // text nodes, classes, attributes, and badges that differ, instead of rebuilding every cell; rebuilding was what made
  // scrolling drop frames under CPU pressure in the D21 spike. The skeleton is rebuilt only when the row changes kind
  // (node, detail, status) or the columns change.
  function setAttr(element, name, value) {
    const cache = element._attrs || (element._attrs = {});
    if (cache[name] === value) {
      return;
    }
    cache[name] = value;
    if (value === null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }

  function setClass(element, value) {
    if (element._cls !== value) {
      element.className = value;
      element._cls = value;
      element._alt = false;
    }
  }

  Object.assign(TreeGrid.prototype, {
    /** Paints a row for a node or a status row. The row element may be recycled from another node. */
    fillRow(rowEl, w) {
      rowEl._w = w;
      const kind = w.status ? "status" : w.h.detail ? "detail" : "node";
      if (rowEl._kind !== kind || rowEl._layout !== this.layout) {
        this.buildRow(rowEl, kind);
      }
      setAttr(rowEl, "aria-level", String(w.level));
      const height = w.span * this.rowH + "px";
      if (rowEl._height !== height) {
        rowEl.style.height = height;
        rowEl._height = height;
      }
      if (kind === "status") {
        this.paintStatusRow(rowEl, w);
      } else if (kind === "detail") {
        this.paintDetailRow(rowEl, w);
      } else {
        this.paintNodeRow(rowEl, w);
      }
    },

    buildRow(rowEl, kind) {
      rowEl.textContent = "";
      // The attribute cache is reset with the skeleton, so drop what a node row of another kind left behind.
      ["aria-expanded", "aria-busy", "aria-setsize", "aria-posinset", "aria-selected", "data-cx-id", "data-cx-status", "data-kind"].forEach((name) => rowEl.removeAttribute(name));
      rowEl._attrs = {};
      rowEl._cls = null;
      rowEl._kind = kind;
      rowEl._layout = this.layout;
      rowEl._height = null;
      rowEl.setAttribute("role", "row");
      rowEl.style.width = this.rowWidth + "px";
      if (kind !== "node") {
        const cell = this.cell(rowEl, 0, this.rowWidth);
        cell.setAttribute("aria-colspan", String(this.cols.length));
        rowEl._cells = [{ cell: cell }];
        if (kind === "status") {
          const indent = cell.appendChild(h("span", "cx-indent"));
          const label = cell.appendChild(h("span"));
          rowEl._cells[0].indent = indent;
          rowEl._cells[0].label = label;
          rowEl._cells[0].text = label.appendChild(document.createTextNode(""));
        }
        return;
      }
      rowEl._cells = this.cols.map((column, i) => {
        const cell = this.cell(rowEl, i, column.width, column.kind);
        const slot = { cell: cell, base: cell.className + (i === 0 ? " cx-tree" : ""), cls: null, title: null, badges: [], iconKey: null, iconEl: null };
        cell.className = slot.base;
        if (i === 0) {
          slot.indent = cell.appendChild(h("span", "cx-indent"));
          slot.exp = cell.appendChild(h("span", "cx-exp"));
          slot.exp.setAttribute("aria-hidden", "true");
          slot.content = cell.appendChild(h("span", "cx-content"));
        } else {
          slot.content = cell;
        }
        slot.textSpan = slot.content.appendChild(h("span", "cx-text"));
        slot.text = slot.textSpan.appendChild(document.createTextNode(""));
        return slot;
      });
    },

    paintStatusRow(rowEl, w) {
      setClass(rowEl, "cx-row cx-status cx-" + w.status);
      setAttr(rowEl, "data-cx-status", w.status);
      const slot = rowEl._cells[0];
      slot.label.className = w.status === "more" ? "cx-more-btn" : "cx-status-text";
      slot.indent.style.width = (w.level - 1) * INDENT + "px";
      if (slot.text.data !== w.h.label) {
        slot.text.data = w.h.label;
      }
    },

    paintDetailRow(rowEl, w) {
      const node = w.h;
      setClass(rowEl, "cx-row cx-detail" + (node.className ? " " + node.className : ""));
      this.paintRowState(rowEl, w);
      // Detail content (and anything a host renderDetail callback set on the cell) is rebuilt on a fresh cell.
      const old = rowEl._cells[0].cell;
      const cell = this.cell(rowEl, 0, this.rowWidth);
      rowEl.replaceChild(cell, old);
      rowEl._cells[0].cell = cell;
      cell.setAttribute("aria-colspan", String(this.cols.length));
      cell.style.paddingLeft = (w.level - 1) * INDENT + 8 + "px";
      this.renderDetail(node, cell);
    },

    paintNodeRow(rowEl, w) {
      const node = w.h;
      setClass(rowEl, "cx-row" + (node.group ? " cx-group" : "") + (node.className ? " " + node.className : ""));
      this.paintRowState(rowEl, w);
      setAttr(rowEl, "aria-expanded", this.expandable(w) ? (w._open ? "true" : "false") : null);
      setAttr(rowEl, "aria-busy", w.loading ? "true" : null);
      const slots = rowEl._cells;
      for (let i = 0; i < this.cols.length; i++) {
        const slot = slots[i];
        if (i === 0) {
          this.paintTreeSlot(slot, w);
        }
        this.paintSlot(slot, node, this.cols[i], this.columnIndex[i], w);
      }
    },

    /** Attributes shared by node and detail rows. */
    paintRowState(rowEl, w) {
      const node = w.h;
      setAttr(rowEl, "data-cx-id", node.id);
      setAttr(rowEl, "data-kind", node.kind || null);
      setAttr(rowEl, "data-cx-status", null);
      setAttr(rowEl, "aria-selected", this.selected.has(w) ? "true" : "false");
      this.setPosition(rowEl, w);
    },

    /** Updates paging metadata without replacing a retained host control or its DOM state. */
    refreshRowState(rowEl, w) {
      setAttr(rowEl, "aria-expanded", this.expandable(w) ? (w._open ? "true" : "false") : null);
      setAttr(rowEl, "aria-busy", w.loading ? "true" : null);
      this.setPosition(rowEl, w);
    },

    /**
     * aria-posinset is the position among the visible siblings in display (sorted) order. aria-setsize counts children
     * that are not loaded yet; -1 means the total is unknown.
     */
    setPosition(rowEl, w) {
      const parent = w.parent;
      const loaded = parent.children ? parent.children.length : 0;
      const size = this.filter ? parent.visibleCount : parent.total != null ? Math.max(parent.total, loaded) : parent.next ? -1 : loaded;
      setAttr(rowEl, "aria-setsize", String(size));
      setAttr(rowEl, "aria-posinset", String(w.pos));
    },

    paintTreeSlot(slot, w) {
      const level = w.level;
      if (slot.level !== level) {
        slot.indent.style.width = (level - 1) * INDENT + "px";
        slot.level = level;
      }
      const expander = this.expandable(w) ? "cx-exp" : "cx-exp cx-leaf";
      if (slot.expCls !== expander) {
        slot.exp.className = expander;
        slot.expCls = expander;
      }
      const key = w.h.icon && this.iconTemplates.has(w.h.icon) ? w.h.icon : null;
      if (slot.iconKey !== key) {
        if (slot.iconEl) {
          slot.iconEl.remove();
        }
        slot.iconEl = key ? this.iconTemplates.get(key).cloneNode(true) : null;
        if (slot.iconEl) {
          slot.cell.insertBefore(slot.iconEl, slot.content);
        }
        slot.iconKey = key;
      }
    },

    paintSlot(slot, node, column, index, w) {
      const value = this.cellOf(node, column, index);
      if (this.opts.renderCell) {
        // Host-rendered cells own their content, so they are rebuilt on every paint, from a clean cell.
        slot.cell.className = slot.base;
        slot.cell.removeAttribute("title");
        slot.cls = slot.base;
        slot.title = null;
        if (slot.content === slot.cell) {
          const old = slot.cell;
          const fresh = this.cell(old.parentNode, this.cols.indexOf(column), column.width, column.kind);
          old.replaceWith(fresh);
          slot.cell = fresh;
          slot.content = fresh;
        } else {
          const fresh = h("span", "cx-content");
          slot.content.replaceWith(fresh);
          slot.content = fresh;
        }
        slot.badges = [];
        if (this.opts.renderCell(node, column.id, slot.content, { level: w.level, expanded: w.expanded, index: index }) === true) {
          return;
        }
        slot.content.appendChild(slot.textSpan);
      }
      const text = cellText(value, column, this.lang);
      if (slot.text.data !== text) {
        slot.text.data = text;
      }
      const object = isCellObject(value);
      const cls = slot.base + (object && value.tone ? " cx-tone-" + value.tone : "");
      if (slot.cls !== cls) {
        if (this.opts.renderCell) {
          // A fallback tone augments a decorator's fresh cell instead of replacing its host classes.
          if (object && value.tone) slot.cell.classList.add("cx-tone-" + value.tone);
        } else {
          slot.cell.className = cls;
        }
        slot.cls = cls;
      }
      const title = object && value.title ? value.title : null;
      if (slot.title !== title) {
        if (title) {
          slot.cell.title = title;
        } else {
          slot.cell.removeAttribute("title");
        }
        slot.title = title;
      }
      this.paintBadges(slot, (index === 0 && node.badges) || null, object && value.badges ? value.badges : null);
    },

    /** Reuses badge elements: updates the ones that exist, adds missing ones, removes extras. */
    paintBadges(slot, first, second) {
      const count = (first ? first.length : 0) + (second ? second.length : 0);
      for (let k = 0; k < count; k++) {
        const badge = first && k < first.length ? first[k] : second[k - (first ? first.length : 0)];
        let span = slot.badges[k];
        if (!span) {
          span = slot.content.appendChild(h("span"));
          span._text = span.appendChild(document.createTextNode(""));
          slot.badges.push(span);
        }
        const cls = "cx-badge cx-tone-" + (badge.tone || "neutral");
        if (span._cls !== cls) {
          span.className = cls;
          span._cls = cls;
        }
        if (span._text.data !== badge.text) {
          span._text.data = badge.text;
        }
        const title = badge.title || null;
        if (span._title !== title) {
          if (title) {
            span.title = title;
          } else {
            span.removeAttribute("title");
          }
          span._title = title;
        }
      }
      while (slot.badges.length > count) {
        slot.badges.pop().remove();
      }
    },

    cell(rowEl, index, width, kind) {
      const cell = h("div", "cx-cell" + (kind ? " cx-kind-" + kind : ""));
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(index + 1));
      cell.style.width = width + "px";
      rowEl.appendChild(cell);
      return cell;
    }
  });
