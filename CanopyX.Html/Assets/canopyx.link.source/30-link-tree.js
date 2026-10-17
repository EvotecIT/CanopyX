  // ---------- link part: trees match external filters against their loaded nodes ----------
  // The external filter joins the tree's own filter (a host predicate or the declared filters): a node shows when it matches
  // both, its ancestors stay as the path to it, and branches open to show the matches. A new query of a query-aware source
  // replaces the tree's own filter, and the external filter is applied again to its rows. The chips sit on a line of their
  // own under the toolbar.
  const SET_FILTER = TreeGrid.prototype.setFilter, APPLY_SNAPSHOT = TreeGrid.prototype.applyQuerySnapshot;
  /** The tree's own filter joined with the external filters; null when neither filters. */
  function linkTreeFilter(grid) {
    const base = grid.linkBase || null, external = grid.linkFilters && grid.linkFilters.length;
    if (!external) return base;
    const matches = linkMatcher(grid);
    return {
      match: node => matches(node) && (!base || base.match(node)),
      keep: base && base.keep ? node => matches(node) && (base.match(node) || base.keep(node)) : undefined,
      linked: true
    };
  }
  Object.assign(TreeGrid.prototype, {
    setFilter(filter, options) {
      const value = typeof filter === "function" ? { match: filter } : filter || null;
      this.linkBase = value && value.linked ? this.linkBase : value;
      SET_FILTER.call(this, linkTreeFilter(this), this.linkFilters && this.linkFilters.length ? { autoExpand: true } : options);
    },
    applyQuerySnapshot(...args) {
      APPLY_SNAPSHOT.apply(this, args);
      this.linkBase = null;
      if (this.linkFilters && this.linkFilters.length) SET_FILTER.call(this, linkTreeFilter(this), { autoExpand: true });
    },
    /** Commits at once: the tree filters its loaded nodes, so nothing can fail or be replaced on the way. */
    linkCommit(next, reason) {
      // The declared filters keep their switches: the joined filter stands in for the one they made.
      const declared = this.filter && this.filter === this.declaredFilter;
      if (this.linkBase === undefined) this.linkBase = this.filter && !this.filter.linked ? this.filter : null;
      this.linkFilters = next; this.linkCommitted = next.slice();
      SET_FILTER.call(this, linkTreeFilter(this), { autoExpand: true });
      if (declared) this.declaredFilter = this.filter;
      this.linkChips(); this.linkChanged(reason);
      return Promise.resolve(true);
    },
    linkCount() { return this.rows.filter(row => !row.status && (!this.filter || row._fm === 2)).length; },
    /** A tree draws its chips on a line between the toolbar and the rows, and removes the line with the last chip. */
    linkChips() {
      const sources = this.linkSources(), active = document.activeElement;
      const key = this.linkBar && this.linkBar.contains(active) ? active.getAttribute("data-cx-condition") : null;
      if (!sources.length) {
        if (this.linkBar) { const had = !!key; this.linkBar.remove(); this.linkBar = null; if (had) this.grid.focus({ preventScroll: true }); }
        return;
      }
      if (!this.linkBar) { this.linkBar = h("div", "cx-link-bar"); this.toolbar.after(this.linkBar); }
      this.linkBar.replaceChildren(...sources.map(source => this.linkChip(source, () => this.linkRemove(source))));
     
      const target = key && [...this.linkBar.children].find(item => item.getAttribute("data-cx-condition") === key);
      if (key) (target || this.linkBar.firstElementChild || this.grid).focus({ preventScroll: true });
    }
  });
  const DESTROY = TreeGrid.prototype.destroy;
  TreeGrid.prototype.destroy = function () { this.linkBar?.remove(); this.linkBar = null; this.host.classList.remove("cx-has-linked"); return DESTROY.call(this); };
