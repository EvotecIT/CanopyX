  // ---------- live data: the API, polling and the rowsChanged event ----------
  // Every change ends with the canopyx:rowsChanged event and onRowsChanged, with { added, updated, removed, missing,
  // orderChanged, newData, revision, source } (source is "api", "poll" or "refresh"). Changes, refreshes and re-sorts run one
  // after another in the order they were asked for, each once the grid's first query, the decoding of compact row data and
  // any query in flight have finished, so they apply to the accepted result.
  Object.assign(DataGrid.prototype, {
    startLive() {
      if (this.view.rowIdentity === "ordinal") throw new Error("CanopyX: ordinal row identity is snapshot-local; keyed live updates require stable row keys.");
      if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
      if (this.liveOpts) return;
      this.liveOpts = liveOptions(this.view, this.opts);
      this.liveQueue = new Map(); this.liveWaiters = []; this.liveScheduled = new Set();
      if (this.liveOpts.flashMs) this.host.style.setProperty("--cx-live-flash-ms", this.liveOpts.flashMs + "ms");
      // A new accepted query (another sort, search or filters, a reload) starts from a freshly sorted order.
      this.host.addEventListener("canopyx:query", () => {
        if (this.liveOrder && this.liveOrder.shape !== gridResultShape(this.acceptedQuery)) this.liveOrder = null;
        this.livePending = null; this.liveMoved = false; this.liveSyncPrompt();
      }, { signal: this.lifetime.signal });
      this.lifetime.signal.addEventListener("abort", () => {
        clearTimeout(this.liveTimer); clearTimeout(this.liveFlashTimer); clearTimeout(this.liveAnnounceTimer);
        this.host.style.removeProperty("--cx-live-flash-ms");
        for (const waiter of this.liveWaiters.splice(0)) waiter.reject(new DOMException("Grid was destroyed.", "AbortError"));
      }, { once: true });
      if (this.liveOpts.pollMs) this.livePoll({ intervalMs: this.liveOpts.pollMs });
    },
    liveStatus() {
      const queued = new Set(this.liveQueue?.keys());
      for (const { change } of this.liveScheduled || []) if (change) {
        for (const row of [...change.add, ...change.update]) queued.add(row.id);
        change.remove.forEach(id => queued.add(id));
      }
      return gridFreeze({ orderChanged: !!(this.liveOrder?.dirty || this.livePending?.pages || this.livePending?.refresh || this.liveMoved), newData: !!this.livePending?.cursor,
        pending: queued.size, polling: !!this.livePoller?.active, revision: this.snapshot?.revision ?? null });
    },
    /** Runs a live task after the ones before it, once the accepted result is settled. */
    liveRun(task) {
      return this.liveChain = (this.liveChain || Promise.resolve()).catch(() => {}).then(async () => { this.startLive(); await this.liveSettle(); return task(); });
    },
    applyTransaction(input) { return this.liveQueueChange(liveTransaction(this, input), "api"); },
    addRows(rows) { return this.applyTransaction({ add: rows }); },
    updateRows(rows) { return this.applyTransaction({ update: rows }); },
    removeRows(ids) { return this.applyTransaction({ remove: ids }); },
    async setRows(rows) {
      if (!this.liveInline()) throw new Error("CanopyX: setRows replaces inline rows; a hosted grid's rows change at its source, then refreshRows().");
      validateGridRows(rows, this.view.columns);
      const owned = liveCopy(rows);
      return this.liveQueueChange(null, "api", owned);
    },
    liveQueueChange(change, source, replacement) {
      if (this.destroyed) return Promise.reject(new DOMException("Grid was destroyed.", "AbortError"));
      this.startLive();
      if (this.view.source.kind === "inline" && this.opts.source)
        return Promise.reject(new Error("CanopyX: this grid's rows belong to its own source; change them through it (an enhanced grid's setData, addRows and removeRows)."));
      if (!this.liveInline() && (change.add.length || change.remove.length))
        return Promise.reject(new Error("CanopyX: rows of a hosted grid are added and removed at its source; call refreshRows() after."));
      const scheduled = { change };
      this.liveScheduled.add(scheduled);
      let waiter;
      const promise = new Promise((resolve, reject) => { waiter = { resolve, reject }; });
      // Queue insertion has the same request order as loads and replacements, even before the first task can start.
      this.liveRun(async () => {
        if (replacement) {
          await this.liveFlush().catch(() => {});
          change = liveTransaction(this, liveDiff(replacement, this.liveRows()));
        }
        this.liveScheduled.delete(scheduled);
        this.liveEnqueueChange(change, source, waiter);
      }).catch(error => { this.liveScheduled.delete(scheduled); waiter.reject(error); });
      return promise;
    },
    liveEnqueueChange(change, source, waiter) {
      liveEnqueue(this.liveQueue, change);
      this.liveWaiters.push(waiter);
      this.liveSource = this.liveSource && this.liveSource !== source ? "api" : source;
      if (!this.liveOpts.batchMs) this.flushTransactions().catch(() => {});
      else if (!this.liveTimer) this.liveTimer = setTimeout(() => this.flushTransactions().catch(() => {}), this.liveOpts.batchMs);
    },
    /** Applies the queued changes now (after the live tasks before them). */
    flushTransactions() {
      clearTimeout(this.liveTimer); this.liveTimer = 0;
      return this.liveRun(() => this.liveFlush());
    },
    /** Drains a batch within its already serialized task, without entering the live chain again. */
    async liveFlush() {
      clearTimeout(this.liveTimer); this.liveTimer = 0;
      // The queue is taken once the result is settled, so changes made meanwhile join this batch.
      const queue = this.liveQueue, waiters = this.liveWaiters.splice(0), source = this.liveSource || "api";
      this.liveQueue = new Map(); this.liveSource = null;
      try {
        const result = queue.size ? await this.liveApply(queue, source) : liveResult();
        waiters.forEach(waiter => waiter.resolve(result));
        return result;
      } catch (error) { waiters.forEach(waiter => waiter.reject(error)); throw error; }
    },
    /** The first query, decoding of compact row data and a query in flight finish before a change applies. */
    async liveSettle() {
      if (!this.acceptedQuery && !this.pendingQuery) await this.ready.catch(() => {});
      while (!this.destroyed && this.pendingQuery) await new Promise(resolve => setTimeout(resolve, 16));
      if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
      if (!this.acceptedQuery) throw new Error("CanopyX: live changes need an accepted query.");
      if (this.view.rowData && this.liveInline()) {
        await this.source.decoded;
        delete this.view.rowData; this.source = inlineGridSource(this.view);
      }
    },
    /** The pages a change keeps: the visible page of a paged grid, else rows around the reader's place, and the focused row's. */
    liveInlinePages(order) {
      const rows = this.liveRows(), size = this.pageSize;
      return (anchor, focus) => {
        const span = Math.ceil((this.grid.clientHeight || 600) / this.rowH) + 30, offsets = new Set();
        const [first, last] = this.paged ? [this.pageOffset, this.pageOffset + this.pageLength - 1] : [Math.max(0, anchor - span), anchor + 2 * span];
        for (let page = Math.floor(first / size) * size; page <= Math.min(last, order.ids.length - 1); page += size) offsets.add(page);
        if (focus >= 0) offsets.add(Math.floor(focus / size) * size);
        return new Map([...offsets].map(offset => [offset, order.ids.slice(offset, offset + size).map(id => liveCopy(rows.get(id)))]));
      };
    },
    liveSwapInline(changed, removed, shifted) {
      const order = this.liveOrder;
      this.liveSwap({ revision: this.snapshot.revision, total: this.liveRows().size, matched: order.ids.length }, this.liveInlinePages(order), id => order.at.get(id) ?? -1, changed, removed, shifted);
    },
    async liveApply(queue, source) {
      let outcome;
      if (this.liveInline()) {
        const projected = this.liveProjected(), { result, changed } = this.liveApplyRows(queue, !projected);
        if (changed.size || result.removed.length) {
          if (!this.opts.source) this.source = inlineGridSource(this.view);
          this.liveOrderSource = this.source;
          if (projected) await this.liveRequery(changed, result.removed);
          else this.liveSwapInline(changed, result.removed, result.added.length > 0 || result.removed.length > 0 || !this.liveOpts.stableOrder);
        }
        outcome = { ...result, orderChanged: !!this.liveOrder?.dirty };
      } else {
        const updates = new Map([...queue.values()].map(change => [change.id, change.row]));
        const { changed, moved, loaded } = this.liveSetHeld(updates, true);
        if (moved) this.liveMoved = true;
        outcome = { added: [], updated: [...changed.keys()], removed: [], missing: [...updates.keys()].filter(id => !loaded.has(id)), orderChanged: this.liveMoved };
      }
      // What happened to the open record matters more to a reader in its drawer than the counts.
      const recordNote = !!this.liveNotes?.length;
      this.liveSyncPrompt();
      if (!recordNote) this.liveAnnounce(outcome);
      this.liveSpeak();
      return this.liveReport(outcome, source);
    },
    liveReport(outcome, source) {
      const detail = gridFreeze({ added: outcome.added || [], updated: outcome.updated || [], removed: outcome.removed || [], missing: outcome.missing || [],
        orderChanged: !!outcome.orderChanged, newData: !!outcome.newData, revision: outcome.revision ?? this.snapshot?.revision ?? null, source });
      if (detail.added.length || detail.updated.length || detail.removed.length || detail.newData || detail.orderChanged || outcome.refreshed) this.emit("rowsChanged", detail);
      return detail;
    },
    /** Asks the source again: a hosted grid's revision-aware refresh, or the live load function of an inline grid. */
    refreshRows() { return this.liveRefresh("refresh"); },
    liveRefresh(source) {
      return this.liveRun(async () => {
        if (this.liveInline()) {
          if (!this.liveOpts.load) return liveResult();
          await this.liveFlush().catch(() => {});
          let answer = await this.runGridHook(signal => this.liveOpts.load({ signal, query: this.acceptedQuery, rows: this.view.rows.length }), this.dataLifetime.signal);
          if (answer == null) return liveResult();
          if (Array.isArray(answer)) { validateGridRows(answer, this.view.columns); answer = liveCopy(answer); }
          const change = liveTransaction(this, Array.isArray(answer) ? liveDiff(answer, this.liveRows()) : answer), queue = new Map();
          // Updates asked for while loading stay in the next batch, after this answer.
          liveEnqueue(queue, change);
          return this.liveApply(queue, source);
        }
        if (this.view.source.kind === "inline") return liveResult();
        const outcome = await this.liveRefreshHost(false);
        if (!outcome) return liveResult();
        const changed = [...outcome.changed].filter(([, columns]) => columns !== "*").map(([id]) => id);
        this.liveSpeak();
        return this.liveReport({ updated: changed, orderChanged: outcome.orderChanged, newData: outcome.newData, revision: outcome.revision, refreshed: true }, source);
      });
    },
    /** Shows the sorted order: kept rows move to their places, a hosted grid shows its newest result, a cursor grid its first page. */
    resort() {
      return this.liveRun(async () => {
        const pending = this.livePending, revision = this.snapshot?.revision;
        if (pending?.cursor) { this.livePending = null; this.liveSyncPrompt(); await this.setQuery({ ...this.acceptedQuery, cursor: undefined, revision: undefined }, { pageLength: this.pageLength }); return; }
        if (this.liveInline()) {
          this.liveOrder = null; this.liveMoved = false;
          if (this.liveProjected()) await this.liveRequery(new Map(), []);
          else { this.liveOrderOf(); this.liveSwapInline(new Map(), [], true); }
        } else if (pending?.pages) {
          this.livePending = null; this.liveMoved = false;
          const position = new Map();
          for (const [offset, items] of pending.pages) items.forEach((item, index) => position.set(item.id, offset + index));
          this.liveSwap(pending.snapshot, () => pending.pages, id => position.get(id) ?? -1, new Map(), []);
        } else { this.liveMoved = false; await this.liveRefreshHost(true); }
        this.liveSyncPrompt();
        if (!this.liveInline() && this.snapshot?.revision !== revision) this.liveReport({ refreshed: true, revision: this.snapshot.revision }, "refresh");
        this.liveNote(this.labels.gridLiveSorted); this.liveSpeak();
      });
    },
    /**
     * Polls the source every intervalMs (250 to 86,400,000): a hosted grid's revision-aware refresh, or the load function of
     * an inline grid. A poll is skipped while one runs and while the page is hidden (then it runs once the page shows again);
     * refresh() polls now. Returns { pause(), resume(), stop(), refresh(), paused, active }; the grid's destruction stops it.
     */
    async poll(options = {}) { return this.livePoll(options); },
    livePoll(options) {
      this.startLive();
      if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("CanopyX: poll takes options.");
      const interval = options.intervalMs ?? this.liveOpts.pollMs, hidden = options.pauseWhenHidden ?? this.liveOpts.pauseWhenHidden;
      if (!Number.isInteger(interval) || interval < 250 || interval > 86400000 || typeof hidden !== "boolean" || options.load !== undefined && typeof options.load !== "function")
        throw new Error("CanopyX: poll needs intervalMs from 250 to 86400000.");
      if (options.load) this.liveOpts.load = options.load;
      if (this.liveInline() && !this.liveOpts.load) throw new Error("CanopyX: an inline grid polls a load function (live.load or poll({ load })).");
      this.livePoller?.stop();
      const lifetime = new AbortController();
      let timer = 0, running = null, paused = false, due = false;
      const schedule = () => { clearTimeout(timer); timer = paused || lifetime.signal.aborted ? 0 : setTimeout(tick, interval); };
      const tick = now => {
        clearTimeout(timer); timer = 0;
        if (lifetime.signal.aborted || paused && !now) return Promise.resolve();
        if (hidden && document.hidden && !now) { due = true; return Promise.resolve(); }
        if (running) return running;
        return running = this.liveRefresh("poll").then(() => undefined, error => { if (error?.name !== "AbortError") this.emit("error", { error }); })
          .finally(() => { running = null; schedule(); });
      };
      const stop = () => { lifetime.abort(); clearTimeout(timer); if (this.livePoller === poller) this.livePoller = null; };
      document.addEventListener("visibilitychange", () => { if (!document.hidden && due && !paused) { due = false; tick(); } }, { signal: lifetime.signal });
      this.lifetime.signal.addEventListener("abort", stop, { once: true, signal: lifetime.signal });
      const poller = Object.freeze({
        pause() { paused = true; clearTimeout(timer); timer = 0; },
        resume() { if (!paused || lifetime.signal.aborted) return; paused = false; due = false; tick(); },
        stop, refresh: () => tick(true),
        get paused() { return paused; }, get active() { return !lifetime.signal.aborted && !paused; }
      });
      this.livePoller = poller;
      if (options.immediate) tick(); else schedule();
      return poller;
    }
  });

  function liveResult() { return gridFreeze({ added: [], updated: [], removed: [], missing: [], orderChanged: false, newData: false, revision: null, source: "api" }); }
