// Tree interaction policy uses the shared UI without making ordinary data grids carry its workflow.
UI_IMPL.treeActions = {
    start(hostControl) {
      const signal = this.interactionUiLifetime.signal;
      this.grid.addEventListener("scroll", () => {
        const panel = this.interactionPanel;
        // A reveal can queue its scroll event before a newly placed panel opens.
        if (panel && (panel._cxScrollTop !== this.grid.scrollTop || panel._cxScrollLeft !== this.grid.scrollLeft)) this.closeInteractionPanel(false);
      }, { signal, passive: true });
      global.addEventListener("resize", () => this.closeInteractionPanel(), { signal });
      this.actionMenuBinding = UI_IMPL.contextMenu(this.grid, (_event, row) => {
        const w = row._w, items = this.actionMenuItems(w);
        return row._w === w && this.rendered.get(w) === row ? items : [];
      }, {
        host: this.host,
        label: this.labels.actions, closeOnFocusOutside: true,
        match: event => {
          const row = event.target.closest(".cx-row");
          return row && this.grid.contains(row) && !hostControl(event.target) ? row : null;
        },
        beforeOpen: (_event, row, settings) => {
          const w = settings.node || row._w, revision = (this.uiWorkRevision || 0) + (this.interactionPanel ? 1 : 0);
          if (!this.actionMenuEligible(w) || row._w !== w) return false;
          if (this.interactionPanel) this.closeInteractionPanel(false);
          if (this.interactionClosing || this.destroyed || (this.uiWorkRevision || 0) !== revision) return false;
          this.render();
          return this.actionMenuEligible(w) && (this.uiWorkRevision || 0) === revision && this.rendered.get(w)?.isConnected ? this.rendered.get(w) : false;
        },
        onOpen: ({ menu, element }) => {
          this.interactionPanel = menu; this.panelNode = element._w;
          menu._cxScrollTop = this.grid.scrollTop; menu._cxScrollLeft = this.grid.scrollLeft;
          document.dispatchEvent(new CustomEvent("canopyx:closemenus", { detail: { source: menu } }));
        },
        onClose: ({ menu }) => {
          if (this.interactionPanel !== menu) return;
          this.interactionPanel = null; this.panelNode = null;
          this.uiWorkRevision = (this.uiWorkRevision || 0) + 1;
        },
        onSelect: item => { Promise.resolve().then(() => item.run()).catch(error => this.emit("error", { error })); }
      });
      signal.addEventListener("abort", () => this.actionMenuBinding(), { once: true });
    },

    openInteractionPanel(w, anchor, role, label) {
      const revision = (this.uiWorkRevision || 0) + (this.interactionPanel ? 1 : 0);
      this.closeInteractionPanel(false);
      if (this.destroyed || this.interactionClosing || this.interactionPanel || (this.uiWorkRevision || 0) !== revision) return null;
      this.render();
      anchor = this.rendered.get(w);
      if (this.destroyed || this.interactionClosing || this.interactionPanel || (this.uiWorkRevision || 0) !== revision || !anchor?.isConnected) return null;
      const panel = this.interactionPanel = h("div", "cx-interaction-panel"), lifetime = new AbortController();
      const signal = lifetime.signal;
      panel.setAttribute("role", role); panel.setAttribute("aria-label", label); panel.dataset.hfxPart = "popover";
      // Keep the existing editor geometry when the shared overlay promotes it to the native top layer.
      panel.style.inset = "auto"; panel.style.margin = "0";
      this.panelNode = w; this.host.appendChild(panel);
      panel._cxLifetime = lifetime;
      panel._cxOverlay = UI_TOOLS.overlay(panel, { host: this.host, trigger: anchor, kind: "popover", focus: false, decorateTrigger: false }, signal);
      // WebKit on macOS blurs an editor to the body when a native button is clicked.
      panel.addEventListener("pointerdown", () => { panel._cxPointerFocus = panel.contains(document.activeElement); }, { signal });
      const rememberFocus = event => {
        if (event.target !== panel) return;
        const active = document.activeElement;
        panel._cxOwnedFocus = panel.contains(active) || panel._cxPointerFocus && (active === document.body || active === document.documentElement);
      };
      for (const type of ["cx-popover:cancel", "cx-popover:beforeclose"]) panel.addEventListener(type, rememberFocus, { signal });
      panel.addEventListener("cx-popover:close", event => {
        if (event.target === panel && this.interactionPanel === panel) this.closeInteractionPanel(event.detail.reason === "cancel");
      }, { signal });
      this.interactionUiLifetime.signal.addEventListener("abort", () => lifetime.abort(), { once: true, signal });
      panel._cxOverlay.open();
      return this.interactionPanel === panel && !this.destroyed && (this.uiWorkRevision || 0) === revision ? panel : null;
    },

    closeInteractionPanel(restoreFocus = true) {
      const panel = this.interactionPanel, controller = this.editorController, w = this.panelNode;
      if (!panel) { this.actionMenuBinding?.close("replace", false, true); return null; }
      const active = document.activeElement;
      const owned = panel._cxOwnedFocus || panel.contains(active) || panel._cxPointerFocus && (active === document.body || active === document.documentElement);
      if (panel.getAttribute("role") === "menu") {
        this.actionMenuBinding.close("close", false, true);
        const focus = owned ? { node: w, revision: this.uiWorkRevision } : null;
        if (restoreFocus) this.restoreInteractionFocus(focus);
        return focus;
      }
      if (controller && this.uiPendingOperation && this.uiPendingOperation.controller === controller) {
        this.uiPendingOperation = null; setText(this.live, "");
      }
      this.uiWorkRevision = (this.uiWorkRevision || 0) + 1;
      const focus = owned ? { node: w, revision: this.uiWorkRevision } : null;
      this.interactionPanel = null; this.panelNode = null; this.editorController = null;
      // Retire the overlay before removing its element or delivering host abort callbacks, which may open a successor.
      panel._cxLifetime.abort(); panel.remove();
      this.abortInteractionController(controller);
      if (restoreFocus) this.restoreInteractionFocus(focus);
      return focus;
    },

    placeInteractionPanel(anchor) {
      const panel = this.interactionPanel;
      if (!panel || panel.getAttribute("role") === "menu") return;
      UI_TOOLS.position(panel, anchor, "bottom-start");
      panel._cxScrollTop = this.grid.scrollTop; panel._cxScrollLeft = this.grid.scrollLeft;
    },

    async performInteraction(work, controller = null) {
      this.uiWorkRevision = (this.uiWorkRevision || 0) + 1;
      const operation = this.uiPendingOperation = { controller };
      setText(this.live, this.labels.interactionPending);
      try {
        const accepted = await work();
        if (!this.destroyed && this.uiPendingOperation === operation) setText(this.live, accepted ? "" : this.labels.interactionRejected);
        return accepted;
      } catch (error) {
        if (!this.destroyed && this.uiPendingOperation === operation) setText(this.live, fill(this.labels.interactionFailed, { error: error && error.message || String(error) }));
        return false;
      } finally {
        if (this.uiPendingOperation === operation) this.uiPendingOperation = null;
      }
    },

    beginEdit(id, columnId, cellIsObject) {
      if (this.destroyed || this.interactionClosing || this.initializing || this.restoring || !this.opts.onEdit) return false;
      const w = this.interactionNode(id), index = this.columns.findIndex(column => column.id === columnId), column = this.columns[index];
      if (!w || !column || !column.editable || column.hidden || !this.eligible("canEdit", w.h, column)) return false;
      const row = this.rendered.get(w);
      if (!row || !row.isConnected) return false;
      const label = fill(this.labels.editValue, { column: column.title });
      const panel = this.openInteractionPanel(w, row, "dialog", label);
      if (!panel) return false;
      const controller = this.editorController = new AbortController();
      const raw = this.cellOf(w.h, column, index), value = cellIsObject(raw) ? raw.value : raw;
      const input = h("input", "cx-editor");
      input.type = column.kind === "number" || typeof value === "number" ? "number" : typeof value === "boolean" ? "checkbox" : "text";
      if (input.type === "number") { input.step = "any"; input.required = true; }
      input.checked = value === true;
      input.value = value == null ? "" : String(value); input.setAttribute("aria-label", label);
      // A corrected value must dismiss the previous custom error before the next save.
      input.addEventListener("input", () => input.setCustomValidity(""));
      const controls = h("div", "cx-interaction-buttons");
      const save = h("button", "cx-save"), cancel = h("button"); save.type = cancel.type = "button";
      setText(save, this.labels.saveEdit); setText(cancel, this.labels.cancelEdit);
      const title = h("div", "cx-interaction-title"); setText(title, label);
      controls.append(save, cancel); panel.append(title, input, controls);
      const submit = async () => {
        if (save.disabled) return;
        let next = input.type === "checkbox" ? input.checked : input.value;
        if (input.type === "number") {
          if (!input.value.trim() || !Number.isFinite(Number(input.value))) {
            input.setCustomValidity(fill(this.labels.invalidEdit, { column: column.title })); input.reportValidity(); return;
          }
          next = Number(input.value);
        }
        input.setCustomValidity(""); input.disabled = save.disabled = true;
        cancel.focus();
        const accepted = await this.performInteraction(() => this.requestEdit(id, columnId, next, { signal: controller.signal, reason: "editor" }), controller);
        if (this.interactionPanel !== panel) return;
        if (accepted) this.closeInteractionPanel();
        else { input.disabled = save.disabled = false; input.focus(); }
      };
      save.addEventListener("click", submit);
      cancel.addEventListener("click", () => this.closeInteractionPanel());
      panel.addEventListener("keydown", event => {
        if (event.key === "Enter" && event.target === input) { event.preventDefault(); submit(); }
      });
      this.placeInteractionPanel(row); input.focus(); if (input.type !== "checkbox") input.select();
      return true;
    },

    moveSources(w) {
      if (!this.view.dragDrop || !this.opts.onDrop || this.destroyed || this.interactionClosing || this.initializing || this.restoring || !w || w.status || w.h.detail) return false;
      const nodes = this.selected.has(w) ? Array.from(this.selected).filter(node => !node.h.detail) : [w];
      if (!nodes.length || !nodes.every(node => this.keyMap.get(node.key) === node && !node._invalidated && this.eligible("canDrag", node.h))) return false;
      return nodes;
    },

    markMove(w) {
      const nodes = this.moveSources(w);
      if (!nodes) return false;
      this.moveNodes = nodes; this.cacheDirty = true;
      setText(this.live, this.labels.markMove);
      return true;
    },

    moveTarget(w, placement = "inside") {
      if (!this.moveNodes || !w || w.status || w.h.detail || this.destroyed) return false;
      const nodes = this.moveNodes;
      if (nodes.some(node => node._invalidated || this.keyMap.get(node.key) !== node)) return false;
      return !!this.prepareDrop(nodes.map(node => node.key), w.key, placement) && this.moveNodes === nodes;
    },

    async moveTo(w, placement, reason = "menu") {
      if (!this.moveTarget(w, placement)) return false;
      const nodes = this.moveNodes; this.moveNodes = null; this.cacheDirty = true;
      return this.performInteraction(() => this.requestDrop(nodes.map(node => node.key), w.key, placement, { reason }));
    },

    actionMenuEligible(w) {
      return !this.destroyed && !this.interactionClosing && !this.initializing && !this.restoring &&
        !!w && !w.status && !w.h.detail && !w._invalidated && this.keyMap.get(w.key) === w;
    },

    actionMenuItems(w) {
      if (!this.actionMenuEligible(w)) return [];
      const items = [];
      if (this.opts.onEdit) for (const column of this.columns) {
        if (column.editable && !column.hidden) items.push({ id: "edit:" + column.id, label: fill(this.labels.editValue, { column: column.title }),
          disabled: !this.eligible("canEdit", w.h, column), run: () => this.beginEdit(w.key, column.id) });
      }
      if (this.opts.onAction) for (const action of this.interactions.actions) items.push({ id: "action:" + action.id, label: action.label,
        disabled: !this.eligible("isActionEnabled", w.h, action),
        run: () => this.performInteraction(() => this.requestAction(w.key, action.id, { reason: "menu" })) });
      if (this.view.dragDrop && this.opts.onDrop) {
        items.push({ id: "move:mark", label: this.labels.markMove, disabled: !this.moveSources(w), run: () => this.markMove(w) });
        if (this.moveNodes) {
          for (const [placement, label] of [["inside", "moveHere"], ["before", "moveBefore"], ["after", "moveAfter"]])
            items.push({ id: "move:" + placement, label: this.labels[label], disabled: !this.moveTarget(w, placement), run: () => this.moveTo(w, placement) });
          items.push({ id: "move:cancel", label: this.labels.cancelMove, run: () => { this.moveNodes = null; this.cacheDirty = true; } });
        }
      }
      return this.actionMenuEligible(w) ? items : [];
    },

    openActionMenu(w, anchor) {
      if (!this.actionMenuEligible(w) || !anchor?.isConnected || !this.actionMenuBinding) return false;
      const hasItems = this.opts.onEdit && this.columns.some(column => column.editable && !column.hidden) ||
        this.opts.onAction && this.interactions.actions.length || this.view.dragDrop && this.opts.onDrop;
      if (!hasItems) return false;
      const opened = this.actionMenuBinding.open(null, anchor, { keyboard: true, node: w });
      if (opened?.then) { opened.catch(error => { if (!this.destroyed) this.emit("error", { error }); }); return true; }
      return opened;
    },

    onKey(event, hostControl) {
      if (!event.defaultPrevented && !event.isComposing && !hostControl(event.target) && event.ctrlKey && event.shiftKey && !event.altKey) {
        const row = event.target.closest(".cx-row"), w = row && row._w;
        if (event.key.toLowerCase() === "x" && this.markMove(w)) { event.preventDefault(); event.stopPropagation(); return true; }
        if (event.key.toLowerCase() === "v" && this.moveTarget(w)) {
          event.preventDefault(); event.stopPropagation(); this.moveTo(w, "inside", "keyboard"); return true;
        }
      }
      return false;
    },

};
