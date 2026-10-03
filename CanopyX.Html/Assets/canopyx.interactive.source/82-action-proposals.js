  // ---------- host-governed interaction proposals ----------
  function interactionSettings(options) {
    const view = options.view, ids = new Set();
    if (view.dragDrop !== undefined && typeof view.dragDrop !== "boolean") throw new Error("CanopyX: dragDrop must be a boolean.");
    for (const column of view.columns || []) {
      if (column.editable !== undefined && typeof column.editable !== "boolean") throw new Error("CanopyX: editable must be a boolean.");
    }
    if (view.contextActions !== undefined && !Array.isArray(view.contextActions)) throw new Error("CanopyX: contextActions must be an array.");
    const actions = (view.contextActions || []).map(action => {
      requireIdentifier(action && action.id, "action ID");
      if (ids.has(action.id) || typeof action.label !== "string" || !action.label.trim()) throw new Error("CanopyX: actions need unique IDs and visible labels.");
      ids.add(action.id);
      return Object.freeze({ id: action.id, label: action.label });
    });
    for (const name of ["onEdit", "onDrop", "onAction", "canEdit", "canDrag", "canDrop", "isActionEnabled"]) {
      if (options[name] != null && typeof options[name] !== "function") throw new Error("CanopyX: " + name + " must be a function.");
    }
    const timeout = options.interactionTimeoutMs === undefined ? 30000 : options.interactionTimeoutMs;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_PROTOCOL_INTEGER) throw new Error("CanopyX: interactionTimeoutMs must be a positive protocol integer.");
    return { actions, timeout };
  }

  function frozenPath(path) { return Object.freeze(path.slice()); }
  function scalarValue(value) {
    return value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
  }

  TreeGrid = class extends TreeGrid {
    constructor(host, options) {
      const settings = interactionSettings(options);
      super(host, options);
      this.interactions = settings;
      this.interactionRevision = 0;
      this.interactionPins = new Set();
    }

    interactionApi() {
      return Object.assign(super.interactionApi(), {
        requestEdit: (id, column, value, options) => this.requestEdit(id, column, value, options),
        requestDrop: (ids, target, placement, options) => this.requestDrop(ids, target, placement, options),
        requestAction: (id, action, options) => this.requestAction(id, action, options),
        cancelInteraction: () => this.cancelInteraction()
      });
    }

    cachePinned(w) {
      return super.cachePinned(w) || !!(this.interactionPins && this.interactionPins.has(w));
    }

    reconcileList(parent, items, total, next, positions, ordering = false, suppressExpansion = false, resetLazy = false) {
      if (!ordering && this.pendingInteraction) {
        const replaced = this.descendants(parent);
        if (this.interactionPins.has(parent) || Array.from(this.interactionPins).some(w => replaced.get(w.key) === w)) this.cancelInteraction();
      }
      return super.reconcileList(parent, items, total, next, positions, ordering, suppressExpansion, resetLazy);
    }

    retireWrapper(w) {
      if (this.interactionPins && this.interactionPins.has(w)) this.cancelInteraction();
      return super.retireWrapper(w);
    }

    applyCounts(doc, fromRefresh = false) {
      const operation = this.pendingInteraction;
      const result = super.applyCounts(doc, fromRefresh);
      if (operation && this.pendingInteraction === operation && doc.items.some(item =>
          Array.from(this.interactionPins).some(w => w.key === item.id))) this.cancelInteraction();
      return result;
    }

    refreshCounts(ids) {
      if (!this.destroyed && this.source.counts && this.pendingInteraction) {
        const wanted = new Set(ids || this.rows.filter(w => !w.status).map(w => w.key));
        if (Array.from(this.interactionPins).some(w => wanted.has(w.key))) this.cancelInteraction();
      }
      return super.refreshCounts(ids);
    }

    interactionNode(id) {
      requireIdentifier(id, "interaction node ID");
      const w = this.keyMap.get(id);
      return w && !w._invalidated && !w.h.detail ? w : null;
    }

    eligible(name, ...args) {
      const predicate = this.opts[name];
      if (!predicate) return true;
      const result = predicate(...args);
      if (result && typeof result.then === "function") {
        Promise.resolve(result).catch(() => {});
        throw new Error("CanopyX: " + name + " must return synchronously.");
      }
      return result !== false;
    }

    async requestEdit(id, columnId, value, options) {
      if (this.destroyed || this.interactionClosing || options && options.signal && options.signal.aborted) return false;
      if (!scalarValue(value)) throw new Error("CanopyX: an edit value must be a finite JSON scalar.");
      const revision = this.interactionRevision, w = this.interactionNode(id);
      const index = this.columns.findIndex(column => column.id === columnId), column = this.columns[index];
      if (!w || !column || !column.editable || !this.eligible("canEdit", w.h, column)) return false;
      const raw = this.cellOf(w.h, column, index), previous = isCellObject(raw) ? raw.value : raw;
      const proposal = Object.freeze({ nodeId: id, path: frozenPath(this.pathOf(w)), column: columnId,
        previous: previous === undefined ? null : previous, value });
      return this.dispatchProposal("edit", proposal, [w], revision, options, () => this.eligible("canEdit", w.h, column));
    }

    async requestDrop(ids, targetId, placement = "inside", options) {
      if (this.destroyed || this.interactionClosing || options && options.signal && options.signal.aborted) return false;
      const revision = this.interactionRevision, prepared = this.prepareDrop(ids, targetId, placement);
      if (!prepared) return false;
      const { proposal, roots, target } = prepared;
      return this.dispatchProposal("drop", proposal, roots.concat(target || []), revision, options,
        () => roots.every(w => this.eligible("canDrag", w.h)) && this.eligible("canDrop", proposal));
    }

    // UI affordances and dispatch use the same normalized, immutable proposal and host eligibility policy.
    prepareDrop(ids, targetId, placement) {
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error("CanopyX: a drop needs unique loaded node IDs.");
      if (!["inside", "before", "after"].includes(placement)) throw new Error("CanopyX: drop placement is inside, before, or after.");
      const revision = this.interactionRevision, nodes = ids.map(id => this.interactionNode(id));
      const target = targetId === null ? null : this.interactionNode(targetId);
      if (!this.view.dragDrop || nodes.some(w => !w) || targetId !== null && !target || targetId === null && placement !== "inside") return false;
      const targetPath = target ? this.pathOf(target) : [];
      if (nodes.some(w => targetPath.includes(w.key) || !this.eligible("canDrag", w.h))) return false;
      const roots = nodes.filter(w => !this.pathOf(w).slice(0, -1).some(id => ids.includes(id)));
      const proposal = Object.freeze({ nodes: Object.freeze(roots.map(w => Object.freeze({ nodeId: w.key, path: frozenPath(this.pathOf(w)) }))),
        target: Object.freeze({ nodeId: targetId, path: frozenPath(targetPath) }), placement });
      if (!this.eligible("canDrop", proposal)) return false;
      if (this.destroyed || this.interactionClosing || revision !== this.interactionRevision ||
          nodes.concat(target || []).some(w => w._invalidated || this.keyMap.get(w.key) !== w)) return false;
      return { proposal, roots, target };
    }

    async requestAction(id, actionId, options) {
      if (this.destroyed || this.interactionClosing || options && options.signal && options.signal.aborted) return false;
      const revision = this.interactionRevision, w = this.interactionNode(id);
      const action = this.interactions.actions.find(item => item.id === actionId);
      if (!w || !action || !this.eligible("isActionEnabled", w.h, action)) return false;
      const proposal = Object.freeze({ nodeId: id, path: frozenPath(this.pathOf(w)), action: actionId });
      return this.dispatchProposal("action", proposal, [w], revision, options, () => this.eligible("isActionEnabled", w.h, action));
    }

    async dispatchProposal(kind, proposal, nodes, revision, options, eligible) {
      const handler = this.opts["on" + kind[0].toUpperCase() + kind.slice(1)];
      if (!handler || this.destroyed || this.interactionClosing || this.initializing || this.restoring || revision !== this.interactionRevision ||
          options && options.signal && options.signal.aborted) return false;
      const versions = nodes.map(w => ({ w, count: w.countRevision || 0, path: this.pathOf(w) }));
      const afterCancellation = this.interactionRevision + (this.pendingInteraction ? 1 : 0);
      this.cancelInteraction();
      if (this.destroyed || this.interactionClosing || this.interactionRevision !== afterCancellation) return false;
      const controller = new AbortController(), operation = { controller, proposal, kind };
      this.pendingInteraction = operation;
      this.interactionRevision++;
      this.interactionPins = new Set(nodes); this.cacheDirty = true;
      const navigation = navigationScope(this, [controller.signal, options && options.signal], true);
      const live = () => !navigation.cancelled() && this.pendingInteraction === operation && versions.every(({ w, count, path }) => {
        const current = this.pathOf(w);
        return !w._invalidated && this.keyMap.get(w.key) === w && (w.countRevision || 0) === count &&
          current.length === path.length && current.every((id, index) => id === path[index]);
      });
      const reason = options && options.reason || "api";
      let timer, timedOut = false;
      try {
        const event = new CustomEvent("canopyx:before" + kind, { bubbles: true, cancelable: true, detail: proposal });
        if (!this.host.dispatchEvent(event) || !live() || !eligible() || !live()) return false;
        timer = setTimeout(() => {
          timedOut = true;
          if (this.pendingInteraction === operation) this.cancelInteraction();
          else controller.abort();
        }, this.interactions.timeout);
        const context = Object.freeze({ signal: navigation.signal, reason,
          query: this.queryAware ? this.getQuery() : null, revision: this.datasetRevision == null ? null : this.datasetRevision });
        const accepted = await navigation.wait(handler(proposal, context));
        if (timedOut) throw new Error("CanopyX: interaction timed out after " + this.interactions.timeout + " milliseconds.");
        if (!live()) return false;
        if (typeof accepted !== "boolean") throw new Error("CanopyX: a host interaction hook must return a boolean acceptance result.");
        this.emit(kind, { proposal, accepted, reason });
        return accepted;
      } catch (error) {
        if (timedOut) throw new Error("CanopyX: interaction timed out after " + this.interactions.timeout + " milliseconds.");
        if (navigation.cancelled()) return false;
        throw error;
      } finally {
        clearTimeout(timer);
        if (this.pendingInteraction === operation) {
          this.pendingInteraction = null; this.interactionPins.clear(); this.cacheDirty = true;
          this.scheduleRender();
        }
        navigation.dispose(); controller.abort();
      }
    }

    cancelInteraction() {
      const operation = this.pendingInteraction;
      if (!operation) return false;
      this.pendingInteraction = null;
      this.interactionRevision++; this.interactionPins.clear(); this.cacheDirty = true;
      this.scheduleRender();
      this.abortInteractionController(operation.controller);
      return true;
    }

    abortInteractionController(controller) {
      if (!controller || controller.signal.aborted) return;
      if (this.interactionReplacementDepth) {
        if (!this.interactionAbortQueue) this.interactionAbortQueue = new Set();
        this.interactionAbortQueue.add(controller);
      } else controller.abort();
    }

    // Abort listeners may synchronously open another editor or proposal. Deliver them after fresh data is attached.
    withInteractionReplacement(work) {
      this.interactionReplacementDepth = (this.interactionReplacementDepth || 0) + 1;
      try { return work(); }
      finally {
        this.interactionReplacementDepth--;
        if (!this.interactionReplacementDepth) {
          const controllers = this.interactionAbortQueue; this.interactionAbortQueue = null;
          if (controllers) for (const controller of controllers) controller.abort();
        }
      }
    }

    destroy() {
      this.interactionClosing = true;
      this.cancelInteraction();
      super.destroy();
      this.interactions = null;
      if (this.interactionPins) this.interactionPins.clear();
    }
  };
