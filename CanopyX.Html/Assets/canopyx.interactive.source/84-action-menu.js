  // ---------- context actions and keyboard move proposals ----------
  TreeGrid = class extends TreeGrid {
    cachePinned(w) {
      return super.cachePinned(w) || this.panelNode === w || !!(this.moveNodes && this.moveNodes.includes(w));
    }

    refreshCounts(ids) {
      return this.withInteractionReplacement(() => super.refreshCounts(ids));
    }

    sort(...args) {
      return this.withInteractionReplacement(() => super.sort(...args));
    }

    relayout(now) {
      return this.withInteractionReplacement(() => {
        const focus = this.closeInteractionPanel(false);
        const result = super.relayout(now);
        this.restoreInteractionFocus(focus);
        return result;
      });
    }

    buildHeader(...args) {
      return this.withInteractionReplacement(() => {
        const focus = this.closeInteractionPanel(false);
        const result = super.buildHeader(...args);
        this.restoreInteractionFocus(focus);
        return result;
      });
    }

    reconcileList(parent, ...args) {
      return this.withInteractionReplacement(() => {
        const ordering = args[4] === true;
        let focus;
        if (!ordering) {
          this.moveNodes = null;
          if (this.panelNode && (parent === this.root || parent === this.panelNode || this.pathOf(this.panelNode).includes(parent.key)))
            focus = this.closeInteractionPanel(false);
        }
        const result = super.reconcileList(parent, ...args);
        focus = focus || this.interactionFocusHandoff; this.interactionFocusHandoff = null;
        this.restoreInteractionFocus(focus);
        return result;
      });
    }

    retireWrapper(w) {
      return this.withInteractionReplacement(() => {
        if (this.panelNode === w) this.interactionFocusHandoff = this.closeInteractionPanel(false) || this.interactionFocusHandoff;
        if (this.moveNodes && this.moveNodes.includes(w)) this.moveNodes = null;
        return super.retireWrapper(w);
      });
    }

    applyCounts(doc, fromRefresh = false) {
      return this.withInteractionReplacement(() => {
        const panel = this.interactionPanel, node = this.panelNode, moving = this.moveNodes;
        const result = super.applyCounts(doc, fromRefresh);
        const focus = node && this.interactionPanel === panel && doc.items.some(item => item.id === node.key) ? this.closeInteractionPanel(false) : null;
        if (moving && this.moveNodes === moving && doc.items.some(item => moving.some(w => w.key === item.id))) this.moveNodes = null;
        const handoff = focus || this.interactionFocusHandoff; this.interactionFocusHandoff = null;
        this.restoreInteractionFocus(handoff);
        return result;
      });
    }

    applyStatePresentation(state) {
      const focus = this.closeInteractionPanel(false); this.moveNodes = null; this.cancelInteraction();
      const result = super.applyStatePresentation(state);
      this.restoreInteractionFocus(focus);
      return result;
    }

    markMove(w) {
      if (!this.view.dragDrop || !this.opts.onDrop || this.destroyed || this.interactionClosing || this.initializing || this.restoring || !w || w.status || w.h.detail) return false;
      const nodes = this.selected.has(w) ? Array.from(this.selected).filter(node => !node.h.detail) : [w];
      if (!nodes.length || !nodes.every(node => this.keyMap.get(node.key) === node && !node._invalidated && this.eligible("canDrag", node.h))) return false;
      this.moveNodes = nodes; this.cacheDirty = true;
      setText(this.live, this.labels.markMove);
      return true;
    }

    moveTarget(w) {
      if (!this.moveNodes || !w || w.status || w.h.detail || this.destroyed) return false;
      const path = this.pathOf(w);
      return this.moveNodes.every(node => !node._invalidated && this.keyMap.get(node.key) === node && !path.includes(node.key));
    }

    async moveTo(w, placement, reason = "menu") {
      if (!this.moveTarget(w)) return false;
      const nodes = this.moveNodes; this.moveNodes = null; this.cacheDirty = true;
      return this.performInteraction(() => this.requestDrop(nodes.map(node => node.key), w.key, placement, { reason }));
    }

    openActionMenu(w, anchor) {
      if (this.destroyed || this.interactionClosing || this.initializing || this.restoring || !w || w.status || w.h.detail || !anchor || !anchor.isConnected) return false;
      const items = [];
      if (this.opts.onEdit) for (const column of this.columns) {
        if (column.editable && !column.hidden) items.push({ label: fill(this.labels.editValue, { column: column.title }),
          disabled: !this.eligible("canEdit", w.h, column), run: () => this.beginEdit(w.key, column.id) });
      }
      if (this.opts.onAction) for (const action of this.interactions.actions) items.push({ label: action.label,
        disabled: !this.eligible("isActionEnabled", w.h, action),
        run: () => this.performInteraction(() => this.requestAction(w.key, action.id, { reason: "menu" })) });
      if (this.view.dragDrop && this.opts.onDrop) {
        items.push({ label: this.labels.markMove, disabled: !this.eligible("canDrag", w.h), run: () => this.markMove(w) });
        if (this.moveNodes) {
          for (const [placement, label] of [["inside", "moveHere"], ["before", "moveBefore"], ["after", "moveAfter"]])
            items.push({ label: this.labels[label], disabled: !this.moveTarget(w), run: () => this.moveTo(w, placement) });
          items.push({ label: this.labels.cancelMove, run: () => { this.moveNodes = null; this.cacheDirty = true; } });
        }
      }
      if (!items.length || this.destroyed || w._invalidated || this.keyMap.get(w.key) !== w) return false;
      const panel = this.openInteractionPanel(w, anchor, "menu", this.labels.actions);
      if (!panel) return false;
      const buttons = items.map(item => {
        const button = h("button", "cx-action-item"); button.type = "button"; button.tabIndex = -1;
        button.setAttribute("role", "menuitem");
        if (item.disabled) button.setAttribute("aria-disabled", "true");
        setText(button, item.label);
        button.addEventListener("click", () => {
          if (item.disabled) return;
          this.closeInteractionPanel(); item.run();
        });
        panel.appendChild(button); return button;
      });
      panel.addEventListener("keydown", event => {
        const index = buttons.indexOf(document.activeElement);
        let target;
        if (event.key === "ArrowDown") target = buttons[(index + 1) % buttons.length];
        else if (event.key === "ArrowUp") target = buttons[(index + buttons.length - 1) % buttons.length];
        else if (event.key === "Home") target = buttons[0];
        else if (event.key === "End") target = buttons[buttons.length - 1];
        else if (event.key === "Escape") this.closeInteractionPanel();
        else if (event.key === "Tab") { this.closeInteractionPanel(); return; }
        else return;
        event.preventDefault(); event.stopPropagation(); if (target) target.focus();
      });
      this.placeInteractionPanel(anchor); buttons[0].focus();
      return true;
    }

    onKey(event) {
      if (!event.defaultPrevented && !event.isComposing && !hostControl(event.target) && event.ctrlKey && event.shiftKey && !event.altKey) {
        const row = event.target.closest(".cx-row"), w = row && row._w;
        if (event.key.toLowerCase() === "x" && this.markMove(w)) { event.preventDefault(); event.stopPropagation(); return; }
        if (event.key.toLowerCase() === "v" && this.moveTarget(w)) {
          event.preventDefault(); event.stopPropagation(); this.moveTo(w, "inside", "keyboard"); return;
        }
      }
      super.onKey(event);
    }

    destroy() { this.moveNodes = null; super.destroy(); }
  };
