
  // ---------- tree grid: row and cell painting ----------
  // A row element keeps a skeleton of cells for the current column layout. Recycling it for another node only updates
  // text nodes, classes, attributes, and badges that differ, instead of rebuilding every cell; rebuilding was what made
  // scrolling drop frames under CPU pressure in the D21 spike. The skeleton is rebuilt only when the row changes kind
  // (node, detail, status) or the columns change. A column the host draws itself (options.renderers) gives its renderer
  // a fresh element on every paint (46-host-cells.js); rows the renderer leaves to the default keep the reused cell.
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
      // A detail row without a declared height takes the height of its content and is measured after the paint.
      const auto = kind === "detail" && w.auto;
      this.observeDetail(rowEl, auto);
      const height = auto ? "auto" : w.hpx + "px";
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
        const slot = { cell: cell, base: cell.className + (i === 0 ? " cx-tree" : ""), cls: null, title: null, badges: [], iconKey: null, iconEl: null, mode: "default" };
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
      setClass(rowEl, "cx-row cx-detail" + (w.auto ? " cx-detail-auto" : "") + (node.group ? " cx-group" : "") + (node.className ? " " + node.className : ""));
      this.paintRowState(rowEl, w);
      // Detail content (and anything a host renderDetail callback put into it) is rebuilt on a fresh cell.
      const old = rowEl._cells[0].cell;
      const cell = this.cell(rowEl, 0, this.rowWidth);
      rowEl.replaceChild(cell, old);
      rowEl._cells[0].cell = cell;
      cell.setAttribute("aria-colspan", String(this.cols.length));
      // The body sticks at the indent while the grid scrolls sideways, and takes the visible width from there.
      const left = (w.level - 1) * INDENT + 8 + "px";
      cell.style.paddingLeft = left;
      cell.style.setProperty("--cx-detail-left", left);
      this.renderDetail(node, cell);
      // As in node rows, the controls of the detail are reached with cell navigation, not with Tab.
      quietControls(cell);
      if (w.auto) this.measureNeeded = true;
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
      if (rowEl._kind === "node") this.paintTreeSlot(rowEl._cells[0], w);
    },

    /**
     * aria-posinset is the position among the visible siblings in display (sorted) order. aria-setsize counts children
     * that are not loaded yet; -1 means the total is unknown.
     */
    setPosition(rowEl, w) {
      const parent = w.parent;
      const loaded = parent.children ? parent.children.length : 0;
      const size = parent.childrenFiltered ? (parent.next ? -1 : parent.visibleCount) : parent.total != null ? Math.max(parent.total, loaded) : parent.next ? -1 : loaded;
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
      // "host" when the renderer drew the cell, "decorated" when it changed the element and left the text to the default.
      const hosted = column.render ? this.paintHostSlot(slot, node, column, index, w) : null;
      if (hosted === "host") {
        return;
      }
      const decorated = hosted === "decorated";
      const text = cellText(value, column, this.fmt);
      if (slot.text.data !== text) {
        slot.text.data = text;
      }
      const object = isCellObject(value);
      const tone = object ? toneOf(value.tone) : NO_TONE;
      const cls = slot.base + tone.cls;
      if (slot.cls !== cls) {
        if (decorated) {
          // A fallback tone augments a decorator's fresh cell instead of replacing its host classes.
          if (tone.cls) slot.cell.className += tone.cls;
        } else {
          slot.cell.className = cls;
        }
        slot.cls = cls;
      }
      toneColors(slot.cell, tone);
      // A host renderer that falls back to the default text keeps the tooltip it may have set itself.
      const title = object && value.title ? value.title : decorated ? null : otherZone(value, column, this.fmt);
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
        const tone = toneOf(badge.tone || "neutral");
        if (span._cls !== tone.cls) {
          applyTone(span, "cx-badge", tone);
          span._cls = tone.cls;
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

    /** Shows dates in the reader's own time zone ("local") or in UTC ("utc"); the tooltip gives the other one. */
    setTimeZone(zone) {
      if (zone !== "local" && zone !== "utc") {
        throw new Error("CanopyX: the time zone is 'local' or 'utc'.");
      }
      if (this.local === (zone === "local")) {
        return;
      }
      this.local = zone === "local";
      this.fmt = formatting(this.lang, this.local, this.labels);
      this.version++;
      this.scheduleRender();
    },

    cell(rowEl, index, width, kind) {
      const cell = this.newCell(index, width, kind);
      rowEl.appendChild(cell);
      return cell;
    },

    /** A grid cell that is not in a row yet. */
    newCell(index, width, kind) {
      const cell = h("div", "cx-cell" + (kind ? " cx-kind-" + kind : ""));
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(index + 1));
      cell.style.width = width + "px";
      return cell;
    }
  });
