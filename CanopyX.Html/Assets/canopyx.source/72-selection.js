  // ---------- tree grid: selection and deep-link ownership ----------
  Object.assign(TreeGrid.prototype, {
    /** Selects a row. Options: toggle (Ctrl/Cmd or Space with multi-select), range (Shift). */
    select(w, options) {
      if (!w || w.status || w._invalidated) {
        return false;
      }
      const o = options || {};
      if (this.multi && o.range && this.anchor) {
        return this.selectRange(w);
      }
      const next = new Set(this.selected);
      if (this.multi && o.toggle) {
        if (next.has(w)) next.delete(w);
        else next.add(w);
      } else {
        next.clear(); next.add(w);
      }
      return this.commitSelection(next, w, { notify: !o.deferNotify, reason: "row", anchor: w });
    },

    selectRange(w) {
      const from = this.indexOf(this.anchor);
      const to = this.indexOf(w);
      if (from < 0 || to < 0) {
        return this.select(w);
      }
      const next = new Set();
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        const node = this.rows[i];
        if (!node.status && !node._invalidated && this.isSelectable(node)) next.add(node);
      }
      return this.commitSelection(next, w, { reason: "range" });
    },

    /** Selection eligibility applies to additions; existing selection can always be removed. */
    isSelectable(w) {
      return !this.opts.isSelectable || this.opts.isSelectable(w.h) !== false;
    },

    /** Applies one complete proposal after host vetoes, without overwriting a nested selection or retired nodes. */
    commitSelection(next, target, options) {
      if (this.destroyed) return false;
      const o = options || {};
      const revision = this.selectionRevision || 0;
      for (const w of next) if (!this.selected.has(w) && !this.isSelectable(w)) return false;
      const nodes = Array.from(next, w => w.h), previous = Array.from(this.selected, w => w.h);
      const node = target ? target.h : null;
      const context = { previous, reason: o.reason || "api" };
      if (this.opts.beforeSelect) {
        const decision = this.opts.beforeSelect(node, nodes.slice(), context);
        if (decision && typeof decision.then === "function") throw new Error("CanopyX: beforeSelect must return synchronously.");
        if (decision === false) return false;
      }
      const event = new CustomEvent("canopyx:beforeselect", { bubbles: true, cancelable: true,
        detail: { node, nodes: nodes.slice(), previous, reason: context.reason } });
      if (!this.host.dispatchEvent(event) || this.destroyed || revision !== (this.selectionRevision || 0)) return false;
      if (Array.from(next).some(w => w._invalidated || this.keyMap.get(w.key) !== w)) return false;
      this.selected = next;
      if (Object.prototype.hasOwnProperty.call(o, "anchor")) this.anchor = o.anchor;
      this.selectionChanged(target, o.notify !== false);
      return true;
    },

    /** Replaces selection with loaded node ids. Invalid ids or single-select overflow leave the old set intact. */
    setSelection(ids) {
      if (this.destroyed) return false;
      if (!Array.isArray(ids)) throw new Error("CanopyX: setSelection needs an array of loaded node ids.");
      const next = new Set();
      for (const id of ids) {
        requireIdentifier(id, "selection ID");
        const w = this.keyMap.get(id);
        if (!w || w._invalidated) throw new Error("CanopyX: selection node is not loaded: " + id);
        next.add(w);
      }
      if (!this.multi && next.size > 1) throw new Error("CanopyX: this view allows only one selected node.");
      const target = Array.from(next).pop() || null;
      return this.commitSelection(next, target, { reason: ids.length ? "api" : "clear", anchor: target });
    },

    /** Selects eligible visible or loaded rows without fetching any unloaded data; scope is required. */
    selectAll(options) {
      if (this.destroyed) return false;
      if (!this.multi) throw new Error("CanopyX: selectAll requires multiple selection.");
      const scope = options && options.scope;
      if (scope !== "visible" && scope !== "loaded") throw new Error("CanopyX: selectAll scope must be visible or loaded.");
      const candidates = scope === "visible" ? this.rows : Array.from(this.keyMap.values());
      const next = new Set(candidates.filter(w => !w.status && !w._invalidated && this.isSelectable(w)));
      const target = Array.from(next).pop() || null;
      return this.commitSelection(next, target, { reason: "all", anchor: target });
    },

    selectionChanged(w, notify = true) {
      this.selectionRevision = (this.selectionRevision || 0) + 1;
      for (const [node, row] of this.rendered) {
        if (!node.status) setAttr(row, "aria-selected", this.selected.has(node) ? "true" : "false");
      }
      this.scheduleRender();
      const nodes = Array.from(this.selected).map((s) => s.h);
      this.writeDeepLink(this.selected.has(w) ? w : Array.from(this.selected).pop());
      if (notify) this.notifySelection(w, nodes);
    },

    notifySelection(w, nodes) {
      const node = w ? w.h : null;
      this.emit("select", { node, nodes });
      if (this.opts.onSelect) {
        this.opts.onSelect(node, nodes);
      }
    }
  });
