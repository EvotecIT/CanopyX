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

    setColumnVisible(...args) {
      return this.withInteractionReplacement(() => super.setColumnVisible(...args));
    }

    applyQuerySnapshot(...args) {
      return this.withInteractionReplacement(() => {
        this.cancelInteraction();
        return super.applyQuerySnapshot(...args);
      });
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

    onKey(event) {
      if (UI_IMPL.treeActions?.onKey.call(this, event, hostControl)) return;
      super.onKey(event);
    }
    destroy() { this.moveNodes = null; super.destroy(); }
  };

  // Native drag/drop reads these predicates synchronously. Readiness loads the adapter before normal interaction.
  for (const name of ["moveSources", "markMove", "moveTarget", "moveTo", "actionMenuEligible", "actionMenuItems", "openActionMenu", "beginEdit", "performInteraction", "placeInteractionPanel"]) {
    TreeGrid.prototype[name] = function (...args) {
      if (name === "beginEdit") args = [args[0], args[1], isCellObject];
      const invoke = () => UI_IMPL.treeActions[name].apply(this, args);
      if (UI_IMPL.treeActions) return invoke();
      if (this.destroyed || this.initializing || this.restoring || ["moveSources", "markMove", "moveTarget", "actionMenuEligible"].includes(name)) return false;
      return loadPart(SHARED_PARTS["ui-menu"]).then(() => this.destroyed ? false : invoke());
    };
  }
