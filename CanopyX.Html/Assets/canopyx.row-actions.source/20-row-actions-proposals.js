  // ---------- row actions: host-governed proposals ----------
  // The same contract as a tree's context actions (docs/data-protocol.md#host-interaction-proposals): the runtime freezes a
  // proposal { id, action, row }, raises the cancelable canopyx:beforeRowAction, and hands it to the host's onRowAction with
  // { signal, reason, query, revision }. The hook answers a boolean, { accepted, message? } or a promise of either; CanopyX
  // applies nothing. canopyx:rowAction reports { proposal, accepted, reason, message }. A row has one proposal at a time,
  // its buttons busy until the host answers; other rows stay free. The deadline (interactionTimeoutMs), cancelRowAction and
  // destruction settle it. A rejection or a failure shows on the status line above the rows, which role alert announces.
  function rowActionAborted(signal) {
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  }
  // requestRowAction resolves what canopyx:rowAction reports, { accepted, reason, message }; a proposal that was never made
  // (no such row or action, a disabled action, a pending proposal, a veto) or was cancelled resolves accepted false, message null.
  const rowActionResult = (accepted, reason, message = null) => Object.freeze({ accepted, reason, message });
  Object.assign(DataGrid.prototype, {
    async requestRowAction(id, actionId, options = {}) {
      if (!options || typeof options !== "object") throw new Error("CanopyX: row action options are an object.");
      const reason = options.reason || "api", none = rowActionResult(false, reason);
      if (this.destroyed || !this.rowActions || options.signal?.aborted || this.rowActionPending.has(id)) return none;
      const row = this.rowActionRow(id), state = row && this.rowActionState(row.h), entry = state?.all.find(item => item.action.id === actionId);
      if (!entry || entry.disabled || typeof this.opts.onRowAction !== "function") return none;
      const action = entry.action;
      const proposal = gridFreeze({ id, action: actionId, row: JSON.parse(JSON.stringify(row.h)) });
      if (!this.emit("beforeRowAction", proposal) || this.destroyed || this.rowActionPending.has(id)) return none;
      const controller = new AbortController(), pending = { action, controller };
      this.rowActionPending.set(id, pending); this.rowActionResults.delete(id); this.showRowActionStatus(null);
      this.repaintRowActions(); setText(this.live, fill(this.rowActionText.rowActionPending, { action: action.label }));
      const timer = setTimeout(() => controller.abort(new DOMException("no answer within " + this.rowActionTimeout + " ms", "TimeoutError")), this.rowActionTimeout);
      options.signal?.addEventListener("abort", () => controller.abort(new DOMException("cancelled", "AbortError")), { once: true, signal: controller.signal });
      const context = Object.freeze({ signal: controller.signal, reason, query: this.getQuery(), revision: this.snapshot?.revision ?? null });
      let accepted = false, message = null, failure = null;
      try {
        // A host that answers after the deadline or a cancellation is ignored, also when it fails.
        const answer = Promise.resolve().then(() => this.opts.onRowAction(proposal, context)); answer.catch(() => {});
        const result = await Promise.race([answer, rowActionAborted(controller.signal)]);
        if (typeof result === "boolean") accepted = result;
        else if (result && typeof result === "object" && typeof result.accepted === "boolean" && (result.message == null || typeof result.message === "string")) {
          accepted = result.accepted; message = result.message ? result.message.slice(0, 500) : null;
        } else throw new Error("CanopyX: onRowAction must answer a boolean or { accepted, message }.");
      } catch (error) { failure = error; } finally { clearTimeout(timer); }
      if (this.destroyed || this.rowActionPending.get(id) !== pending) return none;
      this.rowActionPending.delete(id);
      const cancelled = controller.signal.aborted && controller.signal.reason?.name === "AbortError";
      controller.abort();
      if (cancelled) { this.repaintRowActions(); setText(this.live, ""); return none; }
      if (failure) message = fill(this.rowActionText.rowActionFailed, { action: action.label, error: failure.message || String(failure) });
      else if (!accepted) message = message || fill(this.rowActionText.rowActionRejected, { action: action.label });
      if (!accepted) { this.rowActionResults.set(id, { action, message }); this.showRowActionStatus(message); setText(this.live, ""); }
      else setText(this.live, fill(this.rowActionText.rowActionDone, { action: action.label }));
      this.repaintRowActions();
      this.host.dispatchEvent(new CustomEvent("canopyx:rowAction", { detail: Object.freeze({ proposal, accepted, reason, message }) }));
      if (accepted && action.refresh) this.refreshAfterRowAction();
      return rowActionResult(accepted, reason, message);
    },
    /** Cancels the pending proposal of a row, or of every row; true when one was pending. */
    cancelRowAction(id) {
      if (!this.rowActionPending) return false;
      const ids = id === undefined ? [...this.rowActionPending.keys()] : this.rowActionPending.has(id) ? [id] : [];
      for (const key of ids) this.rowActionPending.get(key).controller.abort(new DOMException("cancelled", "AbortError"));
      return ids.length > 0;
    },
    // A grid with live data reads its rows again (refreshRows); any other grid reloads its accepted query.
    refreshAfterRowAction() {
      const work = this.view.live || this.liveLoad ? this.refreshRows() :
        this.setQuery(gridQueryStart(this.queryForChange(true)), this.pendingPaging && { pageLength: this.pendingPaging.pageLength, allRows: this.pendingPaging.allRows });
      Promise.resolve(work).catch(error => { if (error?.name !== "AbortError") this.emit("error", { error }); });
    },
    repaintRowActions() { if (!this.destroyed) { this.version++; this.render(); } }
  });
