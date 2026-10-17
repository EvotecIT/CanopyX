  // ---------- link part: flat grids put external filters into their query ----------
  // The predicates go after the reader's own filters, so a host source applies them like any other condition. The controls
  // the reader uses (search, chips, column menus, the filter editor, the Filters badge) see the query without them, the
  // saved state leaves out the ones that do not persist, and the Clear all buttons remove them with the reader's own
  // conditions. A query that fails puts back the filters the grid showed; one a newer query replaces commits nothing.
  if (DataGrid) {
    const { gridQueryStart } = LINK_IMPL;
    const proto = DataGrid.prototype, SET_QUERY = proto.setQuery, FOR_CHANGE = proto.queryForChange, GET_STATE = proto.getState;
    const SUMMARY = proto.syncQuerySummary, CHROME = proto.syncGridChrome, NOTICE = proto.setNotice, DESTROY = proto.destroy;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), LINK_OWN = LINK_IMPL.queryOwn;
    /** Filters without the external predicates a query carries at its end; a reader condition equal to one stays. */
    const strip = (filters, tail) => {
      filters = filters || [];
      if (!tail || !tail.length || filters.length < tail.length) return filters;
      return tail.every((filter, index) => same(filters[filters.length - tail.length + index], filter)) ? filters.slice(0, filters.length - tail.length) : filters;
    };
    /** The external predicates the pending or accepted query carries. */
    const tailOf = (grid, pending) => pending && grid.pendingQuery && grid.linkSent ? grid.linkSent.ext : grid.linkAcceptedExt;
    Object.assign(proto, {
      setQuery(input, paging) {
        const desired = this.linkFilters || [];
        if (!desired.length && !this.linkAcceptedExt && !this.linkSent) return SET_QUERY.call(this, input, paging);
        // Reader changes and parsed saved state carry reader conditions; a full effective query may end in external predicates.
        const ext = linkPredicates(desired), own = !input || !input.filters ? [] : input[LINK_OWN] ? input.filters : strip(input.filters, tailOf(this, true));
        const before = this.queryEpoch, promise = SET_QUERY.call(this, { ...(input || {}), filters: own.concat(ext), [LINK_OWN]: undefined }, paging);
        // The base takes its epoch before its first wait, so the accepted query later tells which call it came from; a call
        // the base refused before it started (an invalid query) leaves the epoch, and the query in flight, as they were.
        if (this.queryEpoch !== before) this.linkSent = { epoch: this.queryEpoch, ext, desired: desired.slice() };
        return promise.catch(error => {
          if ((!error || error.name !== "AbortError") && !this.destroyed && !this.pendingQuery) {
            // retry() uses the failed query. Keep its reader intent, replacing the failed external tail with restored links.
            if (this.lastFailedQuery && this.linkSent?.epoch === this.queryEpoch)
              this.lastFailedQuery = { ...this.lastFailedQuery, filters: strip(this.lastFailedQuery.filters, this.linkSent.ext), [LINK_OWN]: true };
            this.linkFilters = (this.linkCommitted || []).slice(); this.linkReason = null; this.linkSent = null;
            this.syncQuerySummary();
          }
          throw error;
        });
      },
      queryForChange(includeQueuedInput, includeExternal) {
        const query = FOR_CHANGE.call(this, includeQueuedInput), tail = tailOf(this, true);
        if (includeExternal) return query;
        return tail && query.filters ? { ...query, filters: strip(query.filters, tail), [LINK_OWN]: true } : query;
      },
      getState() {
        const state = GET_STATE.call(this);
        if (!this.linkAcceptedExt) return state;
        const own = strip(state.query.filters, this.linkAcceptedExt);
        const kept = linkPredicates((this.linkCommitted || []).filter(filter => filter.persist)).filter(filter => !own.some(item => same(item, filter)));
        return { ...state, query: { ...state.query, filters: own.concat(kept) } };
      },
      /** Commits the filters through a query that keeps the reader's search, filters and sort; a newer query resolves it false. */
      async linkCommit(next, reason) {
        this.linkFilters = next; this.linkReason = reason;
        if (!this.acceptedQuery && !this.pendingQuery) await this.ready;
        try { await this.setQuery(gridQueryStart(this.queryForChange(true))); return true; }
        catch (error) { if (error && error.name === "AbortError") return false; throw error; }
      },
      /** The reader's Clear all removes the external filters too, once its query is accepted. */
      linkClearAll() { this.linkFilters = []; this.linkReason = "user"; },
      linkCount() { return this.snapshot ? this.snapshot.matched : 0; },
      linkChips() { this.syncQuerySummary(); },
      /** The Filters button counts the reader's own conditions; the external ones have their chips. */
      syncGridChrome() {
        CHROME.call(this);
        const summary = this.linkAcceptedExt && this.acceptedQuery && this.toolbar.querySelector(".cx-grid-filters > summary");
        if (!summary) return;
        const group = item => item ? item.filters.length + item.groups.reduce((sum, child) => sum + group(child), 0) : 0;
        const count = strip(this.acceptedQuery.filters, this.linkAcceptedExt).length + group(this.acceptedQuery.filterGroup);
        summary.classList.toggle("active", !!count); summary.querySelector(".badge")?.remove();
        if (count) { const badge = h("span", "badge"); setText(badge, String(count)); summary.appendChild(badge); }
      },
      /** Commits a newly accepted query's external filters, then draws them as chips before the reader's own conditions. */
      syncQuerySummary() {
        let changed = false;
        if (this.acceptedQuery && this.acceptedQuery !== this.linkSeenQuery) {
          this.linkSeenQuery = this.acceptedQuery;
          const sent = this.linkSent && this.linkSent.epoch === this.queryEpoch ? this.linkSent : null;
          if (sent) {
            this.linkAcceptedExt = sent.ext;
            changed = !same(this.linkCommitted || [], sent.desired);
            this.linkCommitted = sent.desired;
          }
        }
        const active = document.activeElement, key = this.queryChips && this.queryChips.contains(active) ? active.getAttribute("data-cx-condition") : null;
        SUMMARY.call(this);
        if (this.queryChips && this.acceptedQuery && this.linkAcceptedExt) {
          const tail = this.linkAcceptedExt.length, filters = this.acceptedQuery.filters;
          for (let index = filters.length - tail; index < filters.length; index++) this.queryChips.querySelector('[data-cx-condition="filter-' + index + '"]')?.remove();
          const chips = this.linkSources().map(source => this.linkChip(source, () => this.linkRemove(source)));
          this.queryChips.prepend(...chips);
          const clear = this.queryChips.querySelector('[data-cx-condition="clear"]');
          if (clear && chips.length) { const run = clear.onclick; clear.onclick = event => { this.linkClearAll(); run(event); }; }
          if (key && key.startsWith("link-")) {
            const target = [...this.queryChips.children].find(item => item.getAttribute("data-cx-condition") === key) || this.queryChips.querySelector(".cx-link-chip, .cx-grid-chip");
            (target || this.searchInput || this.grid).focus({ preventScroll: true });
          }
        }
        if (changed) { const reason = this.linkReason; this.linkReason = null; this.linkChanged(reason); }
      },
      /** The empty state's Clear all removes the external filters too. */
      setNotice(...args) {
        NOTICE.apply(this, args);
        const clear = (this.linkFilters?.length || this.linkCommitted?.length) && this.notice.querySelector(".acts button");
        if (clear) { const run = clear.onclick; clear.onclick = event => { this.linkClearAll(); run(event); }; }
      },
      destroy() { this.host.classList.remove("cx-has-linked"); return DESTROY.call(this); }
    });
  }
